/*
 * ===========================================
 * Raksha Template Bot (Single-Scan Rules Block)
 * ===========================================
 *
 * REQUIRED BOT FORMAT
 * - Keep exactly: `const bot = { ... };`
 * - Required function: `chooseAction(gameState, myPlayerId, rng)`
 * - Return one legal action object or `null`
 *
 * METADATA FIELDS (required by upload validation)
 * - botName, botAuthor, botLore, version, lastUpdated
 *
 * RAKSHA CORE RULES (engine-authoritative summary)
 * 1) Turn-based, one action per turn:
 *    MOVE, ATTACK, or SKILL (altar move also costs the turn).
 * 2) Duels use deterministic seeded RNG.
 * 3) Units do not have per-unit HP bars. A defeated god respawns.
 * 4) Altar defeat ends the game immediately.
 * 5) Player HP exists at match level (starts at 6).
 *    HP is reduced only on direct GOD-vs-GOD attack duel losses.
 *    Skill/autonomous effects (e.g., willow/pillar/clone outcomes) do not reduce player HP.
 * 6) Skills are board objects: they occupy tiles, block movement, and trigger through engine hooks.
 *
 * WIN CONDITIONS
 * - Win immediately by defeating the enemy altar.
 * - Or win by reducing enemy player HP to 0.
 *
 * SHRINES (ORDER + CHAOS)
 * - Channeling requires standing on a CHARGED shrine for one full turn.
 * - Blessing activates at the start of your next turn only if you stayed on the shrine.
 * - Leaving or being displaced cancels channel.
 * - Shrine cooldown starts only after successful blessing activation/consumption.
 * - Cooldown is 5 rounds. Shrines move through deterministic inward+swap positions.
 * - Order blessing: first eligible HP loss is prevented, unit still respawns.
 * - Chaos blessing: next initiated ATTACK duel gets 75% attacker win chance, then consumes.
 *
 * CHAORDIC EVENT (sudden-death convergence)
 * - Trigger checkpoints: round 30, 40, 45 if HP is tied and no winner yet.
 * - Board active bounds shrink via VOID tiles (outer tiles disabled).
 * - On trigger: pieces reset to stage spawns, skills cleared, shrines reset charged.
 * - Player HP is preserved.
 *
 * ACTIVE HERO SKILLS (current shipped set)
 * - Mahui: Pillar (adjacency trigger, lethal/respawn interaction)
 * - Faros: Cyclone (adjacency trigger, push)
 * - Sajik: Quicksand (adjacency trigger, pull)
 * - Kidu: Zap (teleport marker; zap objects are non-attackable)
 * - Anika: Clone (autonomous clone object)
 * - Jumka: Willow (autonomous attacker object)
 *
 * SECURITY + DETERMINISM CONSTRAINTS FOR USER BOTS
 * - Deterministic only. No Math.random; use provided `rng`.
 * - No browser globals, no node globals, no network, no timers, no eval/import/require.
 * - Pure logic only; do not mutate external state.
 */
const bot = {
  botName: "IWILLUPLOAD",
  botAuthor: "ErnestV1",
  botLore: "A coordinated altar-rush tactician that pairs a sieger with a support escort and only detours for high-value shrine or defense swings.",
  version: "3.0.0",
  lastUpdated: "2026-03-23",

  WEIGHTS: {
    altarWinNow: 100000,
    immediateDefense: 7500,
    punishObjectiveBase: 4200,
    safePressureBase: 3100,
    shrineRaceBase: 1900,
    fallbackTierBase: 800,
    nineByNineOpeningShrineBonus: 320,
    nineByNineCenterShrineBlend: 110,
    nineByNineConversionAttackBonus: 260,
    nineByNineSiegeBonus: 220,
    unsafeMovePenalty: 320,
    unsupportedAdvancePenalty: 230,
    lowHpThreatPenalty: 380,
    abandonDefensePenalty: 320,
    enemySkillDangerPenalty: 210,
    chaseThreatPenalty: 260,
    followUpTrapPenalty: 220,
    adjacencyThreatPenalty: 190,
    overlapThreatPenalty: 130,
    escapePressureBonus: 200,
    progressToAltar: 280,
    twoTurnSiegeBonus: 580,
    castleProximityBonus: 260,
    castleApproachBonus: 180,
    supportScreenBonus: 240,
    blockEnemyRaceBonus: 320,
    interceptLaneBonus: 180,
    centerControlBonus: 95,
    escortSpacingBonus: 220,
    shrineOrderEmergency: 620,
    shrineOrderNormal: 180,
    shrineChaosSpike: 420,
    shrineOpeningRush: 520,
    shrineOpeningCommit: 420,
    shrineStageBonus: 220,
    shrineCommitBonus: 760,
    shrineChannelSafetyBonus: 180,
    shrineDetourPenalty: 260,
    routeOpeningAttack: 1150,
    siegeAttackBonus: 420,
    punishChannelAttack: 760,
    defendAttack: 980,
    altarEmergencyFloor: 1800,
    altarMoveEmergencyPenalty: 2500,
    hpFinishPressure: 520,
    neutralAttackPenalty: 540,
    openingNeutralAttackPenalty: 260,
    badDuelPenalty: 820,
    skillPlacement: 220,
    pathControlSkill: 150,
    defensiveSkillBase: 420,
    willowDefenseBonus: 360,
    chokeDefenseBonus: 220,
    remoteSkillSpamPenalty: 650,
    castleRingSkillBonus: 420,
    altarEscapeBonus: 520,
    selfTrapSkillPenalty: 2600,
    openingSkillDelayPenalty: 900,
    shrineBlockPenalty: 2200,
    channelKeepBonus: 560,
    chaosBlessingAttackBonus: 280,
    duelEdgeUnit: 180,
    objectiveAttackBonus: 480,
    shrineRunnerBonus: 260,
    nonRunnerShrinePenalty: 420,
    phaseConversionBonus: 240,
    phaseSiegeBonus: 200,
    phaseDefenseBonus: 220,
    kiduShrineRunnerBonus: 260,
    anikaConversionBonus: 170,
    farosChokeBonus: 150,
    jumkaDefenseHoldBonus: 190,
    mahuiDefenseTrapBonus: 180,
    sajikControlBonus: 160,
    chaordicAggro: 0.2,
  },

  init() {
    return null;
  },

  getBotMeta() {
    return {
      botName: this.botName,
      botAuthor: this.botAuthor,
      botLore: this.botLore,
      version: this.version,
      lastUpdated: this.lastUpdated,
    };
  },

  onTurn(gameState, myPlayerId, rng) {
    this.init();
    return this.chooseAction(gameState, myPlayerId, rng);
  },

  chooseAction(gameState, myPlayerId, rng) {
    const myAltar = this.getMyAltar(gameState, myPlayerId);
    const enemyAltar = this.getEnemyAltar(gameState, myPlayerId);
    if (!myAltar || !enemyAltar) {
      return this.endTurnFallback(gameState, myPlayerId, rng);
    }

    const legalActions = this.collectLegalActions(gameState, myPlayerId);
    if (legalActions.length === 0) return null;

    const immediateWin = legalActions.find((candidate) =>
      candidate.action.type === "ATTACK" && candidate.targetPiece && candidate.targetPiece.type === "ALTAR",
    );
    if (immediateWin) return immediateWin.action;

    const myHeroes = this.getMyHeroes(gameState, myPlayerId);
    const enemyHeroes = this.getEnemyHeroes(gameState, myPlayerId);
    const myHp = (gameState.playerHp && gameState.playerHp[myPlayerId]) || 6;
    const enemyId = myPlayerId === "P1" ? "P2" : "P1";
    const enemyHp = (gameState.playerHp && gameState.playerHp[enemyId]) || 6;
    const strategy = this.buildStrategyContext(gameState, myPlayerId, myHeroes, enemyHeroes, myAltar, enemyAltar, myHp, enemyHp);
    const bestHeroDefenseScore = this.bestHeroDefenseScore(gameState, legalActions, strategy);
    const forcedDefenseRetreat = this.findForcedDefenseRetreat(legalActions, strategy);
    if (forcedDefenseRetreat) return forcedDefenseRetreat.action;
    const forcedSiegeConversion = this.findForcedSiegeConversion(legalActions, strategy);
    if (forcedSiegeConversion) return forcedSiegeConversion.action;
    const forcedShrineCommit = this.findForcedShrineCommit(legalActions, strategy);
    if (forcedShrineCommit) return forcedShrineCommit.action;
    const forcedShrineAdvance = this.findForcedShrineAdvance(legalActions, strategy);
    if (forcedShrineAdvance) return forcedShrineAdvance.action;

    let candidates = legalActions;
    const preserveIds = this.getRelevantChannelingHeroIds(gameState, strategy, myHeroes, myHp);
    if (preserveIds.size > 0) {
      const filtered = legalActions.filter((candidate) => {
        if (!preserveIds.has(candidate.actor.id)) return true;
        return candidate.action.type !== "MOVE";
      });
      if (filtered.length > 0) candidates = filtered;
    }

    const altarFiltered = candidates.filter((candidate) => {
      if (candidate.actor.type !== "ALTAR") return true;
      return this.isAltarActionEmergency(gameState, candidate, strategy, bestHeroDefenseScore);
    });
    if (altarFiltered.length > 0) candidates = altarFiltered;

    const skillFiltered = candidates.filter((candidate) => !this.shouldSkipSkillTurn(candidate, strategy));
    if (skillFiltered.length > 0) candidates = skillFiltered;

    const tiered = this.pickBestActionFromDecisionLadder(gameState, myPlayerId, candidates, strategy, rng);
    if (tiered) return tiered;

    return this.endTurnFallback(gameState, myPlayerId, rng);
  },

  pickBestActionFromDecisionLadder(gameState, myPlayerId, candidates, strategy, rng) {
    const tierOrder = [
      "IMMEDIATE_ALTAR",
      "SURVIVE_NOW",
      "PUNISH_OBJECTIVE",
      "SAFE_PRESSURE",
      "SHRINE_RACE",
      "FALLBACK",
    ];

    for (const tier of tierOrder) {
      const pool = candidates.filter((candidate) => this.classifyActionTier(gameState, candidate, strategy) === tier);
      if (pool.length === 0) continue;
      const scored = this.evaluateActions(gameState, myPlayerId, pool, strategy, tier);
      if (scored.length > 0) return this.tieBreak(scored, rng);
    }

    const allScored = this.evaluateActions(gameState, myPlayerId, candidates, strategy, "FALLBACK");
    return allScored.length > 0 ? this.tieBreak(allScored, rng) : null;
  },

  evaluateActions(gameState, myPlayerId, legalActions, strategy, tier) {
    const results = [];
    const chaosUrgency = this.chaordicUrgencyScale(gameState, strategy.myHp, strategy.enemyHp);

    for (const candidate of legalActions) {
      const action = candidate.action;
      const actor = candidate.actor;
      const targetTile = this.actionTargetTile(actor, action, candidate);
      if (targetTile && this.isVoidTile(gameState, targetTile, strategy.activeBounds)) continue;

      let score = this.baseTierScore(tier);
      if (action.type === "MOVE") {
        score += this.scoreMoveForRole(gameState, myPlayerId, candidate, strategy);
      } else if (action.type === "ATTACK") {
        score += this.scoreAttackForStrategy(gameState, candidate, strategy);
      } else if (action.type === "SKILL") {
        score += this.WEIGHTS.skillPlacement;
        score += this.scoreSkillForPathControl(gameState, candidate, strategy);
      }

      if (strategy.preserveChannelIds.has(actor.id) && action.type !== "MOVE") {
        score += this.WEIGHTS.channelKeepBonus;
      }

      if (targetTile && strategy.myHp <= 2 && this.isThreatenedByEnemy(targetTile, strategy.enemyHeroes)) {
        score -= this.WEIGHTS.lowHpThreatPenalty;
      }

      score = Math.trunc(score * chaosUrgency);
      results.push({ action, score, key: this.actionKey(action) });
    }

    results.sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return left.key.localeCompare(right.key);
    });
    return results;
  },

  baseTierScore(tier) {
    if (tier === "IMMEDIATE_ALTAR") return this.WEIGHTS.altarWinNow;
    if (tier === "SURVIVE_NOW") return this.WEIGHTS.immediateDefense;
    if (tier === "PUNISH_OBJECTIVE") return this.WEIGHTS.punishObjectiveBase;
    if (tier === "SAFE_PRESSURE") return this.WEIGHTS.safePressureBase;
    if (tier === "SHRINE_RACE") return this.WEIGHTS.shrineRaceBase;
    return this.WEIGHTS.fallbackTierBase;
  },

  classifyActionTier(gameState, candidate, strategy) {
    const action = candidate.action;
    const actor = candidate.actor;
    const role = this.roleForHero(actor, strategy);

    if (action.type === "ATTACK" && candidate.targetPiece && candidate.targetPiece.type === "ALTAR") {
      return "IMMEDIATE_ALTAR";
    }

    if (this.isEmergencyDefenseAction(candidate, strategy)) {
      return "SURVIVE_NOW";
    }

    if (this.isPunishObjectiveAction(gameState, candidate, strategy)) {
      return "PUNISH_OBJECTIVE";
    }

    if (this.isSafePressureAction(gameState, candidate, strategy, role)) {
      return "SAFE_PRESSURE";
    }

    if (this.isStrategicShrineAction(gameState, candidate, strategy)) {
      return "SHRINE_RACE";
    }

    return "FALLBACK";
  },

  buildStrategyContext(gameState, myPlayerId, myHeroes, enemyHeroes, myAltar, enemyAltar, myHp, enemyHp) {
    const activeBounds = this.getActiveBounds(gameState);
    const chargedShrines = this.getChargedShrines(gameState);
    const enemySkillObjects = this.getEnemySkillObjects(gameState, myPlayerId);
    const pathCache = {};

    for (const hero of myHeroes) {
      pathCache[hero.id] = {
        toEnemyAltar: this.computeSafePath(gameState, hero.coord, this.getAltarApproachTiles(gameState, enemyAltar.coord), {
          enemyHeroes,
          enemySkillObjects,
          myAltar,
          enemyAltar,
          enemyThreatLevel: "none",
        }),
        toOwnAltar: this.computeSafePath(gameState, hero.coord, this.getAltarApproachTiles(gameState, myAltar.coord), {
          enemyHeroes,
          enemySkillObjects,
          myAltar,
          enemyAltar,
          enemyThreatLevel: "none",
        }),
        toShrine: this.computeSafePath(gameState, hero.coord, chargedShrines, {
          enemyHeroes,
          enemySkillObjects,
          myAltar,
          enemyAltar,
          enemyThreatLevel: "none",
        }),
      };
    }

    const roleAssignment = this.assignHeroRoles(gameState, myHeroes, enemyHeroes, myAltar, enemyAltar, pathCache);
    const enemyThreat = this.assessEnemyThreat(gameState, myAltar, enemyHeroes, myHp);
    const altarRaceState = this.estimateAltarRace(gameState, myHeroes, enemyHeroes, myAltar, enemyAltar);
    const preserveChannelIds = new Set();
    const roundsLeft = this.getRoundsToNextChaordicCheckpoint(gameState);
    const stageSize = this.getCurrentStageBoardSizeEquivalent(gameState);
    const nearestMyShrineEta = this.nearestShrineEta(myHeroes, pathCache);
    const nearestEnemyShrineEta = this.nearestEnemyShrineEta(gameState, enemyHeroes, myAltar, enemyAltar);
    const isNineByNine = gameState.boardSize === 9;

    const jumka = myHeroes.find((hero) => hero.characterId === "jumka") || null;
    const defenderHeroId = enemyThreat.level !== "none" && jumka
      ? jumka.id
      : roleAssignment.defenderHeroId;
    const phase = this.detectBattlePhase(gameState, {
      myHeroes,
      enemyHeroes,
      myHp,
      enemyHp,
      chargedShrines,
      enemyThreat,
      altarRaceState,
      isNineByNine,
    });

    return {
      myPlayerId,
      myAltar,
      enemyAltar,
      myHeroes,
      enemyHeroes,
      enemySkillObjects: this.getEnemySkillObjects(gameState, myPlayerId),
      myHp,
      enemyHp,
      activeBounds,
      chargedShrines,
      enemySkillObjects,
      pathCache,
      primarySiegerId: roleAssignment.primarySiegerId,
      supportHeroId: roleAssignment.supportHeroId,
      defenderHeroId,
      shrineRunnerId: roleAssignment.shrineRunnerId,
      enemyThreatLevel: enemyThreat.level,
      enemyThreat,
      altarRaceState,
      preserveChannelIds,
      hpDelta: myHp - enemyHp,
      center: this.boardCenter(gameState),
      openingPhase: gameState.turnNumber <= 8,
      openingShrineWindow: gameState.turnNumber <= 10,
      tieNearChaordic: Boolean(roundsLeft !== null && roundsLeft <= 2 && myHp === enemyHp),
      pressureFavorable: altarRaceState.ahead && enemyThreat.level === "none",
      shrineRaceFavored: nearestMyShrineEta <= nearestEnemyShrineEta,
      isCompactBoard: stageSize <= 9,
      isNineByNine,
      phase,
      conversionWindow: phase === "conversion",
      siegeWindow: phase === "siege",
      defenseWindow: phase === "defense",
      siegerPath: roleAssignment.primarySiegerId && pathCache[roleAssignment.primarySiegerId]
        ? pathCache[roleAssignment.primarySiegerId].toEnemyAltar
        : null,
      altarApproachTiles: this.getAltarApproachTiles(gameState, enemyAltar.coord),
      myAltarApproachTiles: this.getAltarApproachTiles(gameState, myAltar.coord),
    };
  },

  assignHeroRoles(gameState, myHeroes, enemyHeroes, myAltar, enemyAltar, pathCache) {
    const ranked = myHeroes.slice().sort((left, right) => {
      const leftPath = pathCache[left.id] ? pathCache[left.id].toEnemyAltar : { totalCost: 999 };
      const rightPath = pathCache[right.id] ? pathCache[right.id].toEnemyAltar : { totalCost: 999 };
      const leftScore = leftPath.totalCost - this.heroRoleBias(left.characterId, "sieger") * 6;
      const rightScore = rightPath.totalCost - this.heroRoleBias(right.characterId, "sieger") * 6;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return left.id.localeCompare(right.id);
    });

    const primarySieger = ranked[0] || null;
    const supportPool = myHeroes.filter((hero) => !primarySieger || hero.id !== primarySieger.id);
    const supportHero = supportPool.slice().sort((left, right) => {
      const leftDist = primarySieger ? this.distance(left.coord, primarySieger.coord) : 0;
      const rightDist = primarySieger ? this.distance(right.coord, primarySieger.coord) : 0;
      const leftScore = leftDist - this.heroRoleBias(left.characterId, "support");
      const rightScore = rightDist - this.heroRoleBias(right.characterId, "support");
      if (leftScore !== rightScore) return leftScore - rightScore;
      return left.id.localeCompare(right.id);
    })[0] || null;

    const defenderHero = myHeroes.slice().sort((left, right) => {
      const leftPath = pathCache[left.id] ? pathCache[left.id].toOwnAltar : { totalCost: 999 };
      const rightPath = pathCache[right.id] ? pathCache[right.id].toOwnAltar : { totalCost: 999 };
      const leftScore = leftPath.totalCost - this.heroRoleBias(left.characterId, "support") * 4;
      const rightScore = rightPath.totalCost - this.heroRoleBias(right.characterId, "support") * 4;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return left.id.localeCompare(right.id);
    })[0] || null;

    let shrineRunner = supportHero || primarySieger || null;
    const chargedShrinePresent = Object.keys(pathCache).some((id) => pathCache[id] && pathCache[id].toShrine && pathCache[id].toShrine.steps < 99);
    if (chargedShrinePresent) {
      shrineRunner = myHeroes.slice().sort((left, right) => {
      const leftPath = pathCache[left.id] ? pathCache[left.id].toShrine : { totalCost: 999 };
      const rightPath = pathCache[right.id] ? pathCache[right.id].toShrine : { totalCost: 999 };
        const leftScore = leftPath.totalCost - this.heroRoleBias(left.characterId, "shrine") * 5;
        const rightScore = rightPath.totalCost - this.heroRoleBias(right.characterId, "shrine") * 5;
        if (leftScore !== rightScore) return leftScore - rightScore;
        return left.id.localeCompare(right.id);
      })[0] || shrineRunner;
    }

    return {
      primarySiegerId: primarySieger ? primarySieger.id : null,
      supportHeroId: supportHero ? supportHero.id : null,
      defenderHeroId: defenderHero ? defenderHero.id : null,
      shrineRunnerId: shrineRunner ? shrineRunner.id : null,
    };
  },

  assessEnemyThreat(gameState, myAltar, enemyHeroes, myHp) {
    const immediateAttackers = [];
    let nearestEta = 99;

    for (const enemy of enemyHeroes) {
      const legal = gameState.legalByPieceId[enemy.id] || {};
      const attacks = legal.attacks || [];
      if (attacks.includes(myAltar.id)) immediateAttackers.push(enemy);
      const path = this.computeSafePath(gameState, enemy.coord, this.getAltarApproachTiles(gameState, myAltar.coord), {
        enemyHeroes: [],
        myAltar,
        enemyAltar: myAltar,
        enemyThreatLevel: "none",
      });
      if (path.steps < nearestEta) nearestEta = path.steps;
    }

    let level = "none";
    if (immediateAttackers.length > 0 || (nearestEta <= 1 && myHp <= 3)) {
      level = "immediate";
    } else if (nearestEta <= 2 || enemyHeroes.some((enemy) => this.distance(enemy.coord, myAltar.coord) <= 2)) {
      level = "soft";
    }

    return {
      level,
      immediateAttackers,
      nearestEta,
    };
  },

  estimateAltarRace(gameState, myHeroes, enemyHeroes, myAltar, enemyAltar) {
    let myBest = 99;
    let enemyBest = 99;

    for (const hero of myHeroes) {
      const path = this.computeSafePath(gameState, hero.coord, this.getAltarApproachTiles(gameState, enemyAltar.coord), {
        enemyHeroes,
        myAltar,
        enemyAltar,
        enemyThreatLevel: "none",
      });
      if (path.steps < myBest) myBest = path.steps;
    }

    for (const enemy of enemyHeroes) {
      const path = this.computeSafePath(gameState, enemy.coord, this.getAltarApproachTiles(gameState, myAltar.coord), {
        enemyHeroes: myHeroes,
        myAltar: enemyAltar,
        enemyAltar: myAltar,
        enemyThreatLevel: "none",
      });
      if (path.steps < enemyBest) enemyBest = path.steps;
    }

    return {
      myBestEta: myBest,
      enemyBestEta: enemyBest,
      ahead: myBest <= enemyBest,
    };
  },

  getRelevantChannelingHeroIds(gameState, strategy, myHeroes, myHp) {
    const preserveIds = new Set();
    for (const hero of myHeroes) {
      if (!hero.shrineChannel || hero.shrineChannel.startedTurnNumber >= gameState.turnNumber) continue;
      const shrineType = this.getShrineTypeAtTile(gameState, hero.coord);
      if (shrineType === "ORDER" && (myHp <= 3 || strategy.enemyThreatLevel !== "none")) preserveIds.add(hero.id);
      if (shrineType === "CHAOS" && (hero.id === strategy.primarySiegerId || hero.id === strategy.supportHeroId)) preserveIds.add(hero.id);
    }
    strategy.preserveChannelIds = preserveIds;
    return preserveIds;
  },

  isEmergencyDefenseAction(candidate, strategy) {
    if (strategy.enemyThreatLevel !== "immediate") return false;
    const action = candidate.action;
    const actor = candidate.actor;
    if (actor.type === "CHARACTER" && this.distance(actor.coord, strategy.myAltar.coord) > 4) return false;

    if (action.type === "ATTACK" && candidate.targetPiece && candidate.targetPiece.type === "CHARACTER") {
      return this.distance(candidate.targetPiece.coord, strategy.myAltar.coord) <= 2;
    }

    if (action.type === "MOVE") {
      return this.distance(action.toTile, strategy.myAltar.coord) <= 2;
    }

    if (action.type === "SKILL") {
      return this.distance(action.targetTile, strategy.myAltar.coord) <= 2;
    }

    return false;
  },

  isSiegeProgressAction(candidate, strategy) {
    const action = candidate.action;
    const actor = candidate.actor;
    if (actor.id !== strategy.primarySiegerId) return false;
    if (action.type === "MOVE") return true;
    if (action.type === "ATTACK" && candidate.targetPiece && candidate.targetPiece.type === "CHARACTER") {
      return this.isRouteBlocker(candidate.targetPiece, strategy);
    }
    if (action.type === "SKILL") return true;
    return false;
  },

  isSupportAction(candidate, strategy) {
    const action = candidate.action;
    const actor = candidate.actor;
    if (actor.id !== strategy.supportHeroId) return false;
    if (action.type === "MOVE") return true;
    if (action.type === "SKILL") return true;
    if (action.type === "ATTACK" && candidate.targetPiece && candidate.targetPiece.type === "CHARACTER") {
      return this.isRouteBlocker(candidate.targetPiece, strategy) || this.distance(candidate.targetPiece.coord, strategy.myAltar.coord) <= 2;
    }
    return false;
  },

  isStrategicShrineAction(gameState, candidate, strategy) {
    const action = candidate.action;
    const actor = candidate.actor;
    if (actor.type !== "CHARACTER" || action.type !== "MOVE") return false;
    const shrinePlan = this.getShrineIntent(gameState, actor.coord, action.toTile, strategy);
    if (!shrinePlan) return false;
    const shrineType = shrinePlan.type;
    const role = this.roleForHero(actor, strategy);
    const isRunner = actor.id === strategy.shrineRunnerId;
    if (strategy.openingShrineWindow && (isRunner || role === "support")) {
      if (shrinePlan.mode === "commit") return true;
      if (shrineType === "CHAOS" || shrineType === "ORDER") return true;
    }
    if (!isRunner && role !== "support" && strategy.pressureFavorable) return false;
    if (shrinePlan.mode === "commit") return true;
    if (shrineType === "ORDER") return strategy.myHp <= 3 || strategy.enemyThreatLevel !== "none" || !strategy.altarRaceState.ahead;
    if (shrineType === "CHAOS") {
      if (!isRunner && role !== "support") return false;
      if (role === "sieger") return this.canConvertChaosSoon(actor, shrinePlan.shrineTile, strategy);
      return role === "support" || role === "flex" || role === "shrine";
    }
    return false;
  },

  isPunishObjectiveAction(gameState, candidate, strategy) {
    const action = candidate.action;
    const actor = candidate.actor;
    const target = candidate.targetPiece;
    if (action.type === "ATTACK" && target && target.type === "CHARACTER") {
      return this.isHighPriorityAttack(gameState, candidate, strategy);
    }
    if (action.type === "MOVE" && actor.type === "CHARACTER" && strategy.enemyThreatLevel !== "none") {
      return this.distance(action.toTile, strategy.myAltar.coord) <= 2;
    }
    if (action.type === "SKILL" && actor.type === "CHARACTER" && strategy.enemyThreatLevel !== "none") {
      return this.distance(action.targetTile, strategy.myAltar.coord) <= 2;
    }
    return false;
  },

  isSafePressureAction(gameState, candidate, strategy, role) {
    if (candidate.action.type === "ATTACK" && candidate.targetPiece && candidate.targetPiece.type === "CHARACTER") {
      return this.attackOpensFinalApproach(candidate, strategy)
        || this.distance(candidate.actor.coord, strategy.enemyAltar.coord) <= 2
        || this.shouldTakeAttack(gameState, candidate, strategy);
    }
    if (role === "sieger" && this.isSiegeProgressAction(candidate, strategy)) return true;
    if (role === "support" && this.isSupportAction(candidate, strategy)) return true;
    if (role === "defender" && candidate.action.type === "MOVE") {
      return this.distance(candidate.action.toTile, strategy.myAltar.coord) <= 3;
    }
    return candidate.action.type === "SKILL";
  },

  scoreMoveForRole(gameState, myPlayerId, candidate, strategy) {
    const actor = candidate.actor;
    const role = this.roleForHero(actor, strategy);
    const toTile = candidate.action.toTile;
    const fromTile = actor.coord;
    let score = 0;

    if (actor.type === "ALTAR" || role === "altar") {
      score += this.scoreAltarEscapeMove(fromTile, toTile, strategy);
      score -= this.tileRiskPenalty(gameState, toTile, strategy, role);
      return Math.trunc(score);
    }

    const beforePath = this.computePathForRole(gameState, actor, fromTile, role, strategy);
    const afterPath = this.computePathForRole(gameState, actor, toTile, role, strategy);
    const progress = Math.max(0, beforePath.totalCost - afterPath.totalCost);
    const heroId = actor.characterId;
    const phase = strategy.phase;

    if (role === "sieger") {
      score += progress * this.WEIGHTS.progressToAltar;
      if (afterPath.steps <= 1) score += this.WEIGHTS.twoTurnSiegeBonus;
      score += Math.max(0, 4 - this.distance(toTile, strategy.enemyAltar.coord)) * this.WEIGHTS.castleProximityBonus;
      score += this.scoreEscortSpacing(toTile, strategy, true);
    } else if (role === "support") {
      score += progress * Math.trunc(this.WEIGHTS.progressToAltar * 0.45);
      score += Math.max(0, 3 - this.distance(toTile, strategy.enemyAltar.coord)) * Math.trunc(this.WEIGHTS.castleApproachBonus * 0.65);
      score += this.scoreSupportScreenTile(toTile, strategy);
      score += this.scoreBlockEnemyRace(toTile, strategy);
      score += this.scoreEscortSpacing(toTile, strategy, false);
    } else {
      score += progress * Math.trunc(this.WEIGHTS.progressToAltar * 0.35);
      score += Math.max(0, 3 - this.distance(toTile, strategy.enemyAltar.coord)) * Math.trunc(this.WEIGHTS.castleApproachBonus * 0.45);
      score += Math.trunc(this.scoreBlockEnemyRace(toTile, strategy) * 0.6);
    }

    if (strategy.isNineByNine) {
      const nearestShrine = this.closestTile(toTile, strategy.chargedShrines);
      if (nearestShrine) {
        const shrineDist = this.distance(toTile, nearestShrine);
        score += Math.max(0, 3 - shrineDist) * this.WEIGHTS.nineByNineCenterShrineBlend;
      }
      score += Math.max(0, 3 - this.distance(toTile, strategy.center)) * Math.trunc(this.WEIGHTS.nineByNineCenterShrineBlend * 0.6);
      if (phase === "opening" && (role === "shrine" || heroId === "kidu")) {
        score += this.WEIGHTS.nineByNineOpeningShrineBonus;
      }
      if (phase === "siege" && role === "sieger") {
        score += this.WEIGHTS.phaseSiegeBonus;
      }
      if (phase === "defense" && (role === "defender" || heroId === "jumka" || heroId === "mahui" || heroId === "faros")) {
        score += this.WEIGHTS.phaseDefenseBonus;
      }
    }

    score += this.scoreCenterControl(fromTile, toTile, strategy);
    score += this.scoreInterceptWindow(actor, toTile, strategy, role);
    score += this.scoreStrategicShrineMove(gameState, myPlayerId, actor, toTile, strategy, role);
    score += this.scoreHeroMoveIntent(actor, toTile, strategy, role);
    score -= this.tileRiskPenalty(gameState, toTile, strategy, role);
    score -= this.unsupportedAdvancePenalty(actor, toTile, strategy, role);

    return Math.trunc(score);
  },

  scoreAttackForStrategy(gameState, candidate, strategy) {
    const actor = candidate.actor;
    const target = candidate.targetPiece;
    const role = this.roleForHero(actor, strategy);
    if (!target) return 0;
    if (target.type === "ALTAR") return this.WEIGHTS.altarWinNow;

    let score = 0;
    if (this.distance(target.coord, strategy.myAltar.coord) <= 2) {
      score += this.WEIGHTS.defendAttack;
    }
    if (this.isRouteBlocker(target, strategy)) {
      score += this.WEIGHTS.routeOpeningAttack;
    }
    if (this.distance(actor.coord, strategy.enemyAltar.coord) <= 2 || this.distance(target.coord, strategy.enemyAltar.coord) <= 2) {
      score += this.WEIGHTS.siegeAttackBonus;
    }
    if (target.shrineChannel || this.isPieceOnChargedShrine(target, gameState)) {
      score += this.WEIGHTS.punishChannelAttack;
    }
    if (strategy.enemyHp <= 2) {
      score += this.WEIGHTS.hpFinishPressure;
    }
    if (this.hasBlessing(actor, "CHAOS")) {
      score += this.WEIGHTS.chaosBlessingAttackBonus;
    }
    if (this.isHighPriorityAttack(gameState, candidate, strategy)) {
      score += this.WEIGHTS.objectiveAttackBonus;
    }
    const duelEdge = this.duelEdgeScore(gameState, candidate, strategy);
    score += duelEdge * this.WEIGHTS.duelEdgeUnit;
    score += this.scoreHeroAttackIntent(actor, target, strategy, duelEdge);
    if (score === 0 && role !== "support") {
      score -= this.WEIGHTS.neutralAttackPenalty;
    }
    if (this.isNeutralAttack(candidate, strategy) && !this.actorHasCombatBlessing(actor)) {
      score -= this.WEIGHTS.neutralAttackPenalty;
      if (strategy.openingPhase) score -= this.WEIGHTS.openingNeutralAttackPenalty;
    }
    if (duelEdge < 0 && !this.isHighPriorityAttack(gameState, candidate, strategy)) {
      score -= this.WEIGHTS.badDuelPenalty;
    }
    return score;
  },

  scoreSkillForPathControl(gameState, candidate, strategy) {
    const actor = candidate.actor;
    const targetTile = candidate.action.targetTile;
    const role = this.roleForHero(actor, strategy);
    const heroId = actor.characterId;
    const adjacentEnemies = strategy.enemyHeroes.filter((enemy) => this.distance(enemy.coord, targetTile) <= 1).length;
    const distToEnemyAltar = this.distance(targetTile, strategy.enemyAltar.coord);
    const distToSiegerPath = this.distanceToPath(targetTile, strategy.siegerPath ? strategy.siegerPath.path : []);
    const distToMyAltar = this.distance(targetTile, strategy.myAltar.coord);
    let score = this.WEIGHTS.pathControlSkill;

    score -= this.scoreSelfTrapSkillPenalty(candidate, strategy);
    if (this.shouldDelaySkillForShrineOrSiege(candidate, strategy)) {
      score -= this.WEIGHTS.openingSkillDelayPenalty;
    }
    score -= this.scoreRemoteSkillSpamPenalty(candidate, strategy);

    if (role === "support" && distToSiegerPath <= 1) score += 120;
    if (role === "sieger" && distToEnemyAltar <= 2) score += 150;
    if (this.distanceToPath(targetTile, strategy.enemyThreat ? strategy.enemyThreat.immediateAttackers.map((piece) => piece.coord) : []) <= 1) score += 100;
    score += this.scoreDefensiveSkillPlacement(candidate, strategy);
    score += this.scoreHeroSkillIntent(candidate, strategy);

    if (heroId === "mahui") score += adjacentEnemies * 140 + Math.max(0, 4 - distToMyAltar) * 30;
    if (heroId === "faros") score += adjacentEnemies * 120 + Math.max(0, 3 - distToSiegerPath) * 55;
    if (heroId === "sajik") score += adjacentEnemies * 110 + Math.max(0, 3 - distToSiegerPath) * 48;
    if (heroId === "kidu") score += Math.max(0, 6 - distToEnemyAltar) * 44 + Math.max(0, 3 - distToSiegerPath) * 36;
    if (heroId === "anika") score += adjacentEnemies * 85 + Math.max(0, 4 - distToEnemyAltar) * 28;
    if (heroId === "jumka") score += adjacentEnemies * 92 + Math.max(0, 4 - distToSiegerPath) * 32;

    return score;
  },

  scoreStrategicShrineMove(gameState, myPlayerId, actor, toTile, strategy, role) {
    if (actor.type !== "CHARACTER") return 0;
    const shrinePlan = this.getShrineIntent(gameState, actor.coord, toTile, strategy);
    if (!shrinePlan) return 0;
    const shrineType = shrinePlan.type;
    const isRunner = actor.id === strategy.shrineRunnerId;
    const softHelper = role === "support" && shrinePlan.mode === "stage";
    if (!isRunner && !softHelper) return -this.WEIGHTS.nonRunnerShrinePenalty;

    const beforePath = this.computeSafePath(gameState, actor.coord, strategy.altarApproachTiles, {
      enemyHeroes: strategy.enemyHeroes,
      myAltar: strategy.myAltar,
      enemyAltar: strategy.enemyAltar,
      enemyThreatLevel: strategy.enemyThreatLevel,
    });
    const detourPenalty = beforePath.steps <= 2 && role === "sieger" ? this.WEIGHTS.shrineDetourPenalty : 0;
    const helperScale = isRunner ? 1 : 0.7;
    const safetyBonus = this.isShrineChannelSafe(shrinePlan.shrineTile, strategy)
      ? this.WEIGHTS.shrineChannelSafetyBonus
      : -Math.trunc(this.WEIGHTS.shrineChannelSafetyBonus * 0.6);
    const openingBonus = strategy.openingShrineWindow
      ? (shrinePlan.mode === "commit" ? this.WEIGHTS.shrineOpeningCommit : this.WEIGHTS.shrineOpeningRush)
      : 0;
    const raceBonus = strategy.shrineRaceFavored ? Math.trunc(this.WEIGHTS.shrineRunnerBonus * 0.45) : 0;

    if (shrineType === "ORDER") {
      const bonus = strategy.myHp <= 3 || strategy.enemyThreatLevel !== "none"
        ? this.WEIGHTS.shrineOrderEmergency
        : this.WEIGHTS.shrineOrderNormal;
      if (shrinePlan.mode === "commit") {
        return Math.trunc((bonus + this.WEIGHTS.shrineRunnerBonus + this.WEIGHTS.shrineCommitBonus + safetyBonus + openingBonus + raceBonus) * helperScale) - detourPenalty;
      }
      return Math.trunc((bonus + this.WEIGHTS.shrineStageBonus + safetyBonus + openingBonus + raceBonus) * helperScale) - detourPenalty;
    }

    if (shrineType === "CHAOS") {
      const canConvertSoon = role === "support"
        || (role === "sieger" && this.canConvertChaosSoon(actor, shrinePlan.shrineTile, strategy))
        || strategy.enemyHeroes.some((enemy) => this.distance(enemy.coord, shrinePlan.shrineTile) <= 2);
      if (!canConvertSoon) return -this.WEIGHTS.shrineDetourPenalty;
      if (shrinePlan.mode === "commit") {
        return Math.trunc((this.WEIGHTS.shrineChaosSpike + this.WEIGHTS.shrineCommitBonus + this.WEIGHTS.shrineRunnerBonus + safetyBonus + openingBonus + raceBonus) * helperScale) - detourPenalty;
      }
      return Math.trunc((this.WEIGHTS.shrineChaosSpike + this.WEIGHTS.shrineStageBonus + openingBonus + raceBonus) * helperScale) - detourPenalty;
    }

    return 0;
  },

  computePathForRole(gameState, actor, originTile, role, strategy) {
    const heroId = actor && actor.characterId;
    if (strategy.isNineByNine) {
      if (strategy.defenseWindow && (role === "defender" || heroId === "jumka" || heroId === "mahui" || heroId === "faros")) {
        return this.computeSafePath(gameState, originTile, strategy.myAltarApproachTiles, {
          enemyHeroes: strategy.enemyHeroes,
          myAltar: strategy.myAltar,
          enemyAltar: strategy.enemyAltar,
          enemyThreatLevel: strategy.enemyThreatLevel,
        });
      }
      if (strategy.phase === "opening" && strategy.chargedShrines.length > 0 && (role === "shrine" || heroId === "kidu")) {
        return this.computeSafePath(gameState, originTile, strategy.chargedShrines, {
          enemyHeroes: strategy.enemyHeroes,
          myAltar: strategy.myAltar,
          enemyAltar: strategy.enemyAltar,
          enemyThreatLevel: strategy.enemyThreatLevel,
        });
      }
      if (strategy.phase === "conversion" && (heroId === "anika" || heroId === "kidu" || role === "sieger")) {
        return this.computeSafePath(gameState, originTile, strategy.altarApproachTiles, {
          enemyHeroes: strategy.enemyHeroes,
          myAltar: strategy.myAltar,
          enemyAltar: strategy.enemyAltar,
          enemyThreatLevel: strategy.enemyThreatLevel,
        });
      }
    }
    if (role === "support" && strategy.primarySiegerId) {
      const sieger = strategy.myHeroes.find((hero) => hero.id === strategy.primarySiegerId);
      const supportGoals = [];
      if (sieger) {
        for (const direction of this.directionVectors()) {
          const tile = { x: sieger.coord.x + direction.x, y: sieger.coord.y + direction.y };
          if (!this.isVoidTile(gameState, tile, strategy.activeBounds)) supportGoals.push(tile);
        }
      }
      if (supportGoals.length > 0) {
        return this.computeSafePath(gameState, originTile, supportGoals, {
          enemyHeroes: strategy.enemyHeroes,
          myAltar: strategy.myAltar,
          enemyAltar: strategy.enemyAltar,
          enemyThreatLevel: strategy.enemyThreatLevel,
        });
      }
    }

    if (role === "support" && strategy.enemyThreatLevel !== "none") {
      return this.computeSafePath(gameState, originTile, strategy.myAltarApproachTiles, {
        enemyHeroes: strategy.enemyHeroes,
        myAltar: strategy.myAltar,
        enemyAltar: strategy.enemyAltar,
        enemyThreatLevel: strategy.enemyThreatLevel,
      });
    }

    return this.computeSafePath(gameState, originTile, strategy.altarApproachTiles, {
      enemyHeroes: strategy.enemyHeroes,
      myAltar: strategy.myAltar,
      enemyAltar: strategy.enemyAltar,
      enemyThreatLevel: strategy.enemyThreatLevel,
    });
  },

  computeSafePath(gameState, startTile, goalTiles, options) {
    if (!startTile || !goalTiles || goalTiles.length === 0) {
      return { path: [], steps: 99, totalCost: 999, safetyCost: 999 };
    }

    const bounds = this.getActiveBounds(gameState);
    const goalKeys = new Set(goalTiles.map((tile) => `${tile.x},${tile.y}`));
    const startKey = `${startTile.x},${startTile.y}`;
    const frontier = [{ tile: startTile, key: startKey, totalCost: 0, steps: 0 }];
    const best = { [startKey]: { totalCost: 0, steps: 0, parent: null } };

    while (frontier.length > 0) {
      frontier.sort((left, right) => {
        if (left.totalCost !== right.totalCost) return left.totalCost - right.totalCost;
        if (left.steps !== right.steps) return left.steps - right.steps;
        return this.compareTiles(left.tile, right.tile);
      });

      const current = frontier.shift();
      if (!current) break;
      if (goalKeys.has(current.key) && current.key !== startKey) {
        const path = this.rebuildPath(best, startKey, current.key);
        return {
          path,
          steps: current.steps,
          totalCost: current.totalCost,
          safetyCost: current.totalCost - current.steps * 10,
        };
      }

      for (const direction of this.directionVectors()) {
        const next = { x: current.tile.x + direction.x, y: current.tile.y + direction.y };
        const nextKey = `${next.x},${next.y}`;
        if (this.isVoidTile(gameState, next, bounds)) continue;
        const blocked = this.isTileBlocked(gameState, next);
        const isGoal = goalKeys.has(nextKey);
        if (blocked && !isGoal) continue;

        const penalty = this.pathTilePenalty(gameState, next, options);
        const nextTotal = current.totalCost + 10 + penalty;
        const nextSteps = current.steps + 1;
        const existing = best[nextKey];
        if (existing && existing.totalCost <= nextTotal) continue;
        best[nextKey] = { totalCost: nextTotal, steps: nextSteps, parent: current.key };
        frontier.push({ tile: next, key: nextKey, totalCost: nextTotal, steps: nextSteps });
      }
    }

    return { path: [], steps: 99, totalCost: 999, safetyCost: 999 };
  },

  pathTilePenalty(gameState, tile, options) {
    const enemyHeroes = (options && options.enemyHeroes) || [];
    const enemySkillObjects = (options && options.enemySkillObjects) || [];
    let penalty = 0;

    for (const enemy of enemyHeroes) {
      const dist = this.distance(tile, enemy.coord);
      if (dist === 0) penalty += 40;
      else if (dist === 1) penalty += 16;
      else if (dist === 2) penalty += 5;
    }
    penalty += this.adjacencyThreatPenalty(tile, enemyHeroes);

    for (const skill of enemySkillObjects) {
      const dist = this.distance(tile, skill.coord);
      if (dist === 0) penalty += this.WEIGHTS.enemySkillDangerPenalty;
      else if (dist === 1) penalty += Math.trunc(this.WEIGHTS.enemySkillDangerPenalty * 0.65);
      else if (dist === 2) penalty += Math.trunc(this.WEIGHTS.enemySkillDangerPenalty * 0.3);
    }

    const openNeighbors = this.directionVectors().filter((direction) => {
      const next = { x: tile.x + direction.x, y: tile.y + direction.y };
      if (this.isVoidTile(gameState, next)) return false;
      return !this.isTileBlocked(gameState, next);
    }).length;
    if (openNeighbors <= 2) penalty += 8;

    if (options && options.enemyThreatLevel !== "none" && options.myAltar && this.distance(tile, options.myAltar.coord) > 4) {
      penalty += 6;
    }

    return penalty;
  },

  tileRiskPenalty(gameState, tile, strategy, role) {
    let penalty = 0;
    const nearbyEnemies = strategy.enemyHeroes.filter((enemy) => this.distance(enemy.coord, tile) <= 1).length;
    penalty += nearbyEnemies * this.WEIGHTS.unsafeMovePenalty;
    const nearbyEnemySkills = (strategy.enemySkillObjects || []).filter((piece) => this.distance(piece.coord, tile) <= 1).length;
    penalty += nearbyEnemySkills * this.WEIGHTS.enemySkillDangerPenalty;
    const enemySupport = this.countAdjacentPieces(tile, strategy.enemyHeroes);
    const allySupport = this.countAdjacentPieces(tile, strategy.myHeroes);
    if (enemySupport > allySupport + 1) {
      penalty += (enemySupport - allySupport - 1) * this.WEIGHTS.unsupportedAdvancePenalty;
    }
    penalty += this.adjacencyThreatPenalty(tile, strategy.enemyHeroes);
    const chasePenalty = this.chaseThreatPenalty(tile, strategy.enemyHeroes);
    penalty += chasePenalty;

    if (strategy.myHp <= 2 && nearbyEnemies > 0) penalty += this.WEIGHTS.lowHpThreatPenalty;
    if (strategy.enemyThreatLevel !== "none" && role !== "support" && this.distance(tile, strategy.myAltar.coord) > 4) {
      penalty += this.WEIGHTS.abandonDefensePenalty;
    }

    return penalty;
  },

  scoreEscortSpacing(toTile, strategy, isSieger) {
    const partnerId = isSieger ? strategy.supportHeroId : strategy.primarySiegerId;
    if (!partnerId) return 0;
    const partner = strategy.myHeroes.find((hero) => hero.id === partnerId);
    if (!partner) return 0;
    const dist = this.distance(toTile, partner.coord);
    if (dist === 1 || dist === 2) return this.WEIGHTS.escortSpacingBonus;
    if (dist === 0 || dist === 3) return Math.trunc(this.WEIGHTS.escortSpacingBonus * 0.5);
    return 0;
  },

  scoreSupportScreenTile(toTile, strategy) {
    const sieger = strategy.myHeroes.find((hero) => hero.id === strategy.primarySiegerId);
    if (!sieger) return 0;
    const dist = this.distance(toTile, sieger.coord);
    if (dist === 1 || dist === 2) return this.WEIGHTS.supportScreenBonus;
    return 0;
  },

  scoreBlockEnemyRace(toTile, strategy) {
    if (strategy.enemyThreatLevel === "none") return 0;
    const enemyApproach = strategy.enemyHeroes.map((hero) => hero.coord);
    const dist = this.distanceToPath(toTile, enemyApproach);
    if (dist <= 1) return this.WEIGHTS.blockEnemyRaceBonus;
    return 0;
  },

  isRouteBlocker(targetPiece, strategy) {
    const siegerPath = strategy.siegerPath ? strategy.siegerPath.path : [];
    if (siegerPath.length === 0) return this.distance(targetPiece.coord, strategy.enemyAltar.coord) <= 2;
    return this.distanceToPath(targetPiece.coord, siegerPath) <= 1;
  },

  roleForHero(hero, strategy) {
    if (!hero || hero.type !== "CHARACTER") return "altar";
    if (hero.id === strategy.defenderHeroId && strategy.enemyThreatLevel !== "none") return "defender";
    if (hero.id === strategy.primarySiegerId) return "sieger";
    if (hero.id === strategy.supportHeroId) return "support";
    if (hero.id === strategy.shrineRunnerId) return "shrine";
    return "flex";
  },

  heroRoleBias(characterId, role) {
    if (role === "sieger") {
      if (characterId === "kidu") return 8;
      if (characterId === "anika") return 7;
      if (characterId === "faros") return 6;
      if (characterId === "sajik") return 5;
      if (characterId === "jumka") return 4;
      if (characterId === "mahui") return 3;
      return 1;
    }

    if (role === "support") {
      if (characterId === "mahui") return 8;
      if (characterId === "faros") return 7;
      if (characterId === "sajik") return 6;
      if (characterId === "jumka") return 5;
      if (characterId === "anika") return 4;
      if (characterId === "kidu") return 3;
      return 1;
    }

    if (role === "shrine") {
      if (characterId === "kidu") return 9;
      if (characterId === "anika") return 6;
      if (characterId === "faros") return 5;
      if (characterId === "sajik") return 5;
      if (characterId === "jumka") return 4;
      if (characterId === "mahui") return 3;
      return 1;
    }

    return 1;
  },

  tieBreak(scoredActions, rng) {
    if (scoredActions.length === 0) return null;
    const topScore = scoredActions[0].score;
    const top = scoredActions.filter((entry) => entry.score === topScore);
    if (top.length === 1) return top[0].action;

    top.sort((left, right) => left.key.localeCompare(right.key));
    const bestKey = top[0].key;
    const bestKeyGroup = top.filter((entry) => entry.key === bestKey);
    if (bestKeyGroup.length === 1) return bestKeyGroup[0].action;
    const picked = rng.pick(bestKeyGroup);
    return (picked || bestKeyGroup[0]).action;
  },

  findForcedShrineCommit(legalActions, strategy) {
    if (!strategy) return null;
    if (strategy.enemyThreatLevel === "immediate") return null;
    if (!strategy.chargedShrines || strategy.chargedShrines.length === 0) return null;

    const commits = (legalActions || []).filter((candidate) => {
      if (!candidate || candidate.actor.type !== "CHARACTER") return false;
      if (candidate.action.type !== "MOVE") return false;
      return strategy.chargedShrines.some((tile) => this.isSameTile(tile, candidate.action.toTile));
    });

    if (commits.length === 0) return null;

    commits.sort((left, right) => {
      const leftScore = this.scoreForcedShrineCommit(left, strategy);
      const rightScore = this.scoreForcedShrineCommit(right, strategy);
      if (leftScore !== rightScore) return rightScore - leftScore;
      return this.actionKey(left.action).localeCompare(this.actionKey(right.action));
    });
    return commits[0];
  },

  findForcedSiegeConversion(legalActions, strategy) {
    if (!strategy) return null;
    if (strategy.enemyThreatLevel !== "none") return null;

    const siegeMoves = (legalActions || []).filter((candidate) => {
      if (!candidate || candidate.actor.type !== "CHARACTER") return false;
      const actor = candidate.actor;
      const role = this.roleForHero(actor, strategy);
      const buffed = this.actorHasCombatBlessing(actor);
      const pressureActor = buffed || actor.id === strategy.primarySiegerId || role === "sieger";
      if (!pressureActor) return false;
      if (!this.shouldPreferCastleFinish(actor, strategy)) return false;

      if (candidate.action.type === "ATTACK" && candidate.targetPiece && candidate.targetPiece.type === "ALTAR") {
        return true;
      }
      if (candidate.action.type !== "MOVE") return false;
      const before = this.distance(actor.coord, strategy.enemyAltar.coord);
      const after = this.distance(candidate.action.toTile, strategy.enemyAltar.coord);
      return before <= 3 && after < before;
    });
    if (siegeMoves.length === 0) return null;

    siegeMoves.sort((left, right) => {
      const leftIsAttack = left.action.type === "ATTACK" ? 1 : 0;
      const rightIsAttack = right.action.type === "ATTACK" ? 1 : 0;
      if (leftIsAttack !== rightIsAttack) return rightIsAttack - leftIsAttack;
      const leftBuff = this.actorHasCombatBlessing(left.actor) ? 1 : 0;
      const rightBuff = this.actorHasCombatBlessing(right.actor) ? 1 : 0;
      if (leftBuff !== rightBuff) return rightBuff - leftBuff;
      const leftAfter = left.action.type === "MOVE" ? this.distance(left.action.toTile, strategy.enemyAltar.coord) : 0;
      const rightAfter = right.action.type === "MOVE" ? this.distance(right.action.toTile, strategy.enemyAltar.coord) : 0;
      if (leftAfter !== rightAfter) return leftAfter - rightAfter;
      return this.actionKey(left.action).localeCompare(this.actionKey(right.action));
    });
    return siegeMoves[0];
  },

  findForcedDefenseRetreat(legalActions, strategy) {
    if (!strategy) return null;
    const chargedThreats = (strategy.enemyHeroes || []).filter((enemy) =>
      this.actorHasCombatBlessing(enemy) && this.distance(enemy.coord, strategy.myAltar.coord) <= 3,
    );
    const immediateAttackers = strategy.enemyThreat && strategy.enemyThreat.immediateAttackers
      ? strategy.enemyThreat.immediateAttackers
      : [];
    const localThreats = this.localAltarThreats(strategy);
    if (chargedThreats.length === 0 && immediateAttackers.length === 0) return null;

    const defenses = (legalActions || []).filter((candidate) => {
      if (!candidate || candidate.actor.type !== "CHARACTER") return false;
      const action = candidate.action;
      if (action.type === "ATTACK" && candidate.targetPiece) {
        return chargedThreats.some((enemy) => enemy.id === candidate.targetPiece.id)
          || immediateAttackers.some((enemy) => enemy.id === candidate.targetPiece.id)
          || this.distance(candidate.targetPiece.coord, strategy.myAltar.coord) <= 2;
      }
      if (action.type === "MOVE") {
        return this.distance(action.toTile, strategy.myAltar.coord) <= 2;
      }
      if (action.type === "SKILL") {
        if (localThreats.length === 0) return false;
        return this.distance(candidate.actor.coord, strategy.myAltar.coord) <= 2
          && this.distance(action.targetTile, strategy.myAltar.coord) <= 2;
      }
      return false;
    });
    if (defenses.length === 0) return null;

    defenses.sort((left, right) => {
      const leftScore = this.scoreForcedDefenseRetreat(left, strategy, chargedThreats, immediateAttackers);
      const rightScore = this.scoreForcedDefenseRetreat(right, strategy, chargedThreats, immediateAttackers);
      if (leftScore !== rightScore) return rightScore - leftScore;
      return this.actionKey(left.action).localeCompare(this.actionKey(right.action));
    });
    return defenses[0];
  },

  scoreForcedDefenseRetreat(candidate, strategy, chargedThreats, immediateAttackers) {
    const actor = candidate.actor;
    const action = candidate.action;
    let score = 0;
    if (actor.id === strategy.defenderHeroId) score += 280;
    if (actor.characterId === "jumka") score += 220;
    if (actor.characterId === "mahui") score += 180;
    if (actor.characterId === "faros") score += 140;

    if (action.type === "ATTACK" && candidate.targetPiece) {
      if (chargedThreats.some((enemy) => enemy.id === candidate.targetPiece.id)) score += 900;
      if (immediateAttackers.some((enemy) => enemy.id === candidate.targetPiece.id)) score += 700;
      score += Math.max(0, 3 - this.distance(candidate.targetPiece.coord, strategy.myAltar.coord)) * 150;
    } else if (action.type === "SKILL") {
      if (this.distance(actor.coord, strategy.myAltar.coord) > 2 || this.localAltarThreats(strategy).length === 0) return -9999;
      score += 500;
      score += Math.max(0, 3 - this.distance(action.targetTile, strategy.myAltar.coord)) * 140;
    } else if (action.type === "MOVE") {
      score += 350;
      score += Math.max(0, 3 - this.distance(action.toTile, strategy.myAltar.coord)) * 120;
    }
    return score;
  },

  findForcedShrineAdvance(legalActions, strategy) {
    if (!strategy) return null;
    if (strategy.enemyThreatLevel === "immediate") return null;
    if (!strategy.chargedShrines || strategy.chargedShrines.length === 0) return null;
    const nearestHero = this.closestHeroToChargedShrine(strategy);

    const moves = (legalActions || []).filter((candidate) => {
      if (!candidate || candidate.actor.type !== "CHARACTER") return false;
      if (candidate.action.type !== "MOVE") return false;
      const nearestShrine = this.closestTile(candidate.actor.coord, strategy.chargedShrines);
      if (!nearestShrine) return false;
      const role = this.roleForHero(candidate.actor, strategy);
      const isPreferred = candidate.actor.id === strategy.shrineRunnerId
        || (nearestHero && candidate.actor.id === nearestHero.id)
        || role === "support";
      if (!isPreferred) return false;
      if (candidate.actor.characterId === "anika" && !this.shouldHeroStayShrineLocked(candidate.actor, strategy)) return false;
      return this.distance(candidate.action.toTile, nearestShrine) < this.distance(candidate.actor.coord, nearestShrine);
    });
    if (moves.length === 0) return null;

    moves.sort((left, right) => {
      const leftShrine = this.closestTile(left.actor.coord, strategy.chargedShrines);
      const rightShrine = this.closestTile(right.actor.coord, strategy.chargedShrines);
      const leftDist = leftShrine ? this.distance(left.action.toTile, leftShrine) : 99;
      const rightDist = rightShrine ? this.distance(right.action.toTile, rightShrine) : 99;
      if (leftDist !== rightDist) return leftDist - rightDist;
      const leftSafe = this.isShrineChannelSafe(left.action.toTile, strategy) ? 1 : 0;
      const rightSafe = this.isShrineChannelSafe(right.action.toTile, strategy) ? 1 : 0;
      if (leftSafe !== rightSafe) return rightSafe - leftSafe;
      return this.actionKey(left.action).localeCompare(this.actionKey(right.action));
    });
    return moves[0];
  },

  closestHeroToChargedShrine(strategy) {
    let bestHero = null;
    let bestDist = 99;
    for (const hero of strategy.myHeroes || []) {
      const nearestShrine = this.closestTile(hero.coord, strategy.chargedShrines);
      if (!nearestShrine) continue;
      const dist = this.distance(hero.coord, nearestShrine);
      if (dist < bestDist) {
        bestDist = dist;
        bestHero = hero;
      }
    }
    return bestHero;
  },

  scoreForcedShrineCommit(candidate, strategy) {
    const actor = candidate.actor;
    const role = this.roleForHero(actor, strategy);
    let score = 0;
    if (actor.id === strategy.shrineRunnerId) score += 500;
    if (role === "support") score += 180;
    if (role === "shrine") score += 220;
    if (actor.characterId === "kidu") score += 220;
    if (actor.characterId === "jumka" && strategy.enemyThreatLevel !== "none") score -= 260;
    if (this.isShrineChannelSafe(candidate.action.toTile, strategy)) score += 260;
    if (strategy.shrineRaceFavored) score += 120;
    return score;
  },

  move(pieceId, toTile) {
    return { type: "MOVE", pieceId, toTile };
  },

  attack(attackerId, targetId) {
    return { type: "ATTACK", attackerId, targetId };
  },

  castSkill(heroId, skillId, targetTile) {
    return { type: "SKILL", heroId, skillId, targetTile };
  },

  endTurnFallback(gameState, myPlayerId, rng) {
    return this.safeRandomLegalAction(gameState, myPlayerId, rng);
  },

  safeRandomLegalAction(gameState, myPlayerId, rng) {
    const legal = this.collectLegalActions(gameState, myPlayerId).map((entry) => entry.action);
    if (legal.length === 0) return null;
    legal.sort((left, right) => this.actionKey(left).localeCompare(this.actionKey(right)));
    return rng.pick(legal) || legal[0];
  },

  collectLegalActions(gameState, myPlayerId) {
    const legalByPieceId = gameState.legalByPieceId || {};
    const pieces = gameState.pieces
      .filter((piece) => piece.owner === myPlayerId && piece.type !== "SKILL_OBJECT")
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));

    const byId = {};
    for (const piece of gameState.pieces) byId[piece.id] = piece;

    const result = [];
    for (const piece of pieces) {
      const legal = legalByPieceId[piece.id] || { moves: [], attacks: [], skills: [] };
      const moves = (legal.moves || []).slice().sort(this.compareTiles);
      const attacks = (legal.attacks || []).slice().sort();
      const skills = (legal.skills || []).slice().sort(this.compareTiles);

      for (const toTile of moves) {
        result.push({ actor: piece, action: this.move(piece.id, toTile) });
      }
      for (const targetId of attacks) {
        result.push({ actor: piece, action: this.attack(piece.id, targetId), targetPiece: byId[targetId] || null });
      }
      if (piece.type === "CHARACTER") {
        const skillId = this.skillIdForHero(piece.characterId);
        for (const targetTile of skills) {
          result.push({ actor: piece, action: this.castSkill(piece.id, skillId, targetTile) });
        }
      }
    }
    return result;
  },

  getEnemyAltar(gameState, myPlayerId) {
    return gameState.pieces.find((piece) => piece.owner !== myPlayerId && piece.type === "ALTAR");
  },

  getMyAltar(gameState, myPlayerId) {
    return gameState.pieces.find((piece) => piece.owner === myPlayerId && piece.type === "ALTAR");
  },

  getMyHeroes(gameState, myPlayerId) {
    return gameState.pieces
      .filter((piece) => piece.owner === myPlayerId && piece.type === "CHARACTER")
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
  },

  getEnemyHeroes(gameState, myPlayerId) {
    return gameState.pieces
      .filter((piece) => piece.owner !== myPlayerId && piece.type === "CHARACTER")
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
  },

  getEnemySkillObjects(gameState, myPlayerId) {
    return gameState.pieces
      .filter((piece) => piece.owner !== myPlayerId && piece.type === "SKILL_OBJECT")
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
  },

  getActiveBounds(gameState) {
    if (gameState.activeBounds) return gameState.activeBounds;
    return {
      minX: 0,
      maxX: gameState.boardSize - 1,
      minY: 0,
      maxY: gameState.boardSize - 1,
    };
  },

  getRoundsToNextChaordicCheckpoint(gameState) {
    if (!gameState.chaordic || typeof gameState.chaordic.roundsToCheckpoint !== "number") return null;
    return gameState.chaordic.roundsToCheckpoint;
  },

  getCurrentStageBoardSizeEquivalent(gameState) {
    const bounds = this.getActiveBounds(gameState);
    return Math.max(1, bounds.maxX - bounds.minX + 1);
  },

  getChargedShrines(gameState) {
    const shrineState = gameState.shrineState || {};
    const charged = [];
    const order = shrineState.orderShrine;
    const chaos = shrineState.chaosShrine;
    if (order && order.state === "CHARGED") charged.push(order.coord);
    if (chaos && chaos.state === "CHARGED") charged.push(chaos.coord);
    return charged.sort(this.compareTiles);
  },

  getShrineTypeAtTile(gameState, tile) {
    const shrineState = gameState.shrineState || {};
    const order = shrineState.orderShrine;
    const chaos = shrineState.chaosShrine;
    if (order && order.state === "CHARGED" && this.isSameTile(order.coord, tile)) return "ORDER";
    if (chaos && chaos.state === "CHARGED" && this.isSameTile(chaos.coord, tile)) return "CHAOS";
    return null;
  },

  getAltarApproachTiles(gameState, altarTile) {
    const goals = [];
    for (const direction of this.directionVectors()) {
      const tile = { x: altarTile.x + direction.x, y: altarTile.y + direction.y };
      if (!this.isVoidTile(gameState, tile)) goals.push(tile);
    }
    return goals.sort(this.compareTiles);
  },

  isVoidTile(gameState, tile, bounds) {
    const active = bounds || this.getActiveBounds(gameState);
    return tile.x < active.minX || tile.x > active.maxX || tile.y < active.minY || tile.y > active.maxY;
  },

  isAdjacent(aTile, bTile) {
    const dx = Math.abs(aTile.x - bTile.x);
    const dy = Math.abs(aTile.y - bTile.y);
    return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
  },

  isTileBlocked(gameState, tile) {
    const occupied = gameState.occupiedByTileKey || {};
    return Boolean(occupied[`${tile.x},${tile.y}`]);
  },

  isThreatenedByEnemy(tile, enemyHeroes) {
    return enemyHeroes.some((enemy) => this.isAdjacent(tile, enemy.coord));
  },

  isPieceOnChargedShrine(piece, gameState) {
    return Boolean(piece && piece.coord && this.getShrineTypeAtTile(gameState, piece.coord));
  },

  hasBlessing(hero, blessingName) {
    if (!hero) return false;
    const blessings = hero.blessings || hero.activeBlessings || [];
    const upper = String(blessingName || "").toUpperCase();
    return blessings.some((entry) => String(entry && entry.type ? entry.type : entry).toUpperCase().includes(upper));
  },

  distance(aTile, bTile) {
    return Math.max(Math.abs(aTile.x - bTile.x), Math.abs(aTile.y - bTile.y));
  },

  distanceToPath(tile, path) {
    if (!path || path.length === 0) return 99;
    let best = 99;
    for (const point of path) {
      const dist = this.distance(tile, point);
      if (dist < best) best = dist;
    }
    return best;
  },

  isSameTile(left, right) {
    return Boolean(left && right && left.x === right.x && left.y === right.y);
  },

  actionTargetTile(actor, action, candidate) {
    if (action.type === "MOVE") return action.toTile;
    if (action.type === "SKILL") return action.targetTile;
    if (action.type === "ATTACK" && candidate.targetPiece) return candidate.targetPiece.coord;
    return actor.coord;
  },

  compareTiles(left, right) {
    return left.y - right.y || left.x - right.x;
  },

  actionKey(action) {
    if (action.type === "MOVE") return `MOVE:${action.pieceId}:${action.toTile.x},${action.toTile.y}`;
    if (action.type === "SKILL") return `SKILL:${action.heroId}:${action.targetTile.x},${action.targetTile.y}`;
    return `ATTACK:${action.attackerId}:${action.targetId}`;
  },

  skillIdForHero(characterId) {
    if (characterId === "mahui") return "PILLAR";
    if (characterId === "kidu") return "ZAP";
    if (characterId === "anika") return "CLONE";
    if (characterId === "faros") return "CYCLONE";
    if (characterId === "sajik") return "QUICKSAND";
    if (characterId === "jumka") return "WILLOW";
    return "SKILL";
  },

  chaordicUrgencyScale(gameState, myHp, enemyHp) {
    const roundsLeft = this.getRoundsToNextChaordicCheckpoint(gameState);
    if (roundsLeft === null) return 1;

    const hpDelta = myHp - enemyHp;
    let scale = 1;
    if (roundsLeft <= 2) scale += this.WEIGHTS.chaordicAggro;
    if (roundsLeft <= 1) scale += 0.15;
    if (gameState.chaordic && gameState.chaordic.hpTied && hpDelta <= 0) scale += 0.1;
    const stageSize = this.getCurrentStageBoardSizeEquivalent(gameState);
    if (stageSize <= 5) scale += 0.08;
    return scale;
  },

  rebuildPath(parentByKey, startKey, endKey) {
    const path = [];
    let cursor = endKey;
    while (cursor && cursor !== startKey) {
      const parts = cursor.split(",");
      path.push({ x: Number(parts[0]), y: Number(parts[1]) });
      cursor = parentByKey[cursor] ? parentByKey[cursor].parent : null;
    }
    path.reverse();
    return path;
  },

  directionVectors() {
    return [
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
    ];
  },

  boardCenter(gameState) {
    const bounds = this.getActiveBounds(gameState);
    return {
      x: Math.floor((bounds.minX + bounds.maxX) / 2),
      y: Math.floor((bounds.minY + bounds.maxY) / 2),
    };
  },

  countAdjacentPieces(tile, pieces, excludeId) {
    return (pieces || []).filter((piece) => piece.id !== excludeId && this.isAdjacent(tile, piece.coord)).length;
  },

  closestEnemyDistance(tile, enemies) {
    let best = 99;
    for (const enemy of enemies || []) {
      const dist = this.distance(tile, enemy.coord);
      if (dist < best) best = dist;
    }
    return best;
  },

  chaseThreatPenalty(tile, enemies) {
    let penalty = 0;
    for (const enemy of enemies || []) {
      const dist = this.distance(tile, enemy.coord);
      if (dist <= 1) penalty += this.WEIGHTS.chaseThreatPenalty;
      else if (dist === 2) penalty += Math.trunc(this.WEIGHTS.chaseThreatPenalty * 0.55);
    }
    return penalty;
  },

  closestTile(fromTile, tiles) {
    let best = null;
    let bestDist = 99;
    for (const tile of tiles || []) {
      const dist = this.distance(fromTile, tile);
      if (dist < bestDist) {
        best = tile;
        bestDist = dist;
      }
    }
    return best;
  },

  closestHeroToShrine(strategy) {
    let bestHero = null;
    let bestDist = 99;
    const shrineTile = this.closestTile(strategy.center, strategy.chargedShrines || []);
    if (!shrineTile) return null;
    for (const hero of strategy.myHeroes || []) {
      const dist = this.distance(hero.coord, shrineTile);
      if (dist < bestDist) {
        bestHero = hero;
        bestDist = dist;
      }
    }
    return bestHero;
  },

  detectBattlePhase(gameState, context) {
    if (context.enemyThreat.level !== "none") return "defense";
    if (context.isNineByNine && gameState.turnNumber <= 6 && context.chargedShrines.length > 0) return "opening";
    if (context.myHeroes.some((hero) => this.actorHasCombatBlessing(hero))) return "conversion";
    if (context.altarRaceState.myBestEta <= 2 || context.altarRaceState.ahead) return "siege";
    return gameState.turnNumber <= 8 ? "opening" : "conversion";
  },

  canConvertChaosSoon(actor, shrineTile, strategy) {
    if (!actor || !shrineTile) return false;
    if (strategy && strategy.openingShrineWindow) return true;
    const nearestEnemy = this.closestEnemyDistance(shrineTile, strategy.enemyHeroes);
    if (nearestEnemy <= 2) return true;
    const enemyAltarDist = this.distance(shrineTile, strategy.enemyAltar.coord);
    return enemyAltarDist <= 3 || this.attackOpensFinalApproach({ actor, action: { type: "MOVE", toTile: shrineTile } }, strategy);
  },

  getShrineIntent(gameState, fromTile, toTile, strategy) {
    const chargedShrines = strategy && strategy.chargedShrines ? strategy.chargedShrines : this.getChargedShrines(gameState);
    if (!chargedShrines || chargedShrines.length === 0) return null;

    let chosenShrine = null;
    let bestAfter = 99;
    let bestBefore = 99;
    for (const shrineTile of chargedShrines) {
      const after = this.distance(toTile, shrineTile);
      const before = this.distance(fromTile, shrineTile);
      if (after < bestAfter || (after === bestAfter && before < bestBefore)) {
        chosenShrine = shrineTile;
        bestAfter = after;
        bestBefore = before;
      }
    }
    if (!chosenShrine) return null;
    if (bestAfter > 1) return null;
    if (bestAfter > bestBefore) return null;

    return {
      shrineTile: chosenShrine,
      type: this.getShrineTypeAtTile(gameState, chosenShrine),
      mode: bestAfter === 0 ? "commit" : "stage",
      beforeDist: bestBefore,
      afterDist: bestAfter,
    };
  },

  isShrineChannelSafe(shrineTile, strategy) {
    if (!shrineTile) return false;
    const enemyAdj = this.countAdjacentPieces(shrineTile, strategy.enemyHeroes);
    const allyAdj = this.countAdjacentPieces(shrineTile, strategy.myHeroes);
    if (enemyAdj === 0) return true;
    if (strategy.myHp <= 2) return allyAdj >= enemyAdj;
    return allyAdj + 1 >= enemyAdj;
  },

  nearestShrineEta(heroes, pathCache) {
    let best = 99;
    for (const hero of heroes || []) {
      const path = pathCache && pathCache[hero.id] ? pathCache[hero.id].toShrine : null;
      if (path && typeof path.steps === "number" && path.steps < best) best = path.steps;
    }
    return best;
  },

  nearestEnemyShrineEta(gameState, enemyHeroes, myAltar, enemyAltar) {
    const chargedShrines = this.getChargedShrines(gameState);
    if (chargedShrines.length === 0) return 99;
    let best = 99;
    for (const enemy of enemyHeroes || []) {
      const path = this.computeSafePath(gameState, enemy.coord, chargedShrines, {
        enemyHeroes: [],
        myAltar,
        enemyAltar,
        enemyThreatLevel: "none",
      });
      if (path.steps < best) best = path.steps;
    }
    return best;
  },

  actorHasCombatBlessing(actor) {
    return this.hasBlessing(actor, "CHAOS") || this.hasBlessing(actor, "ORDER");
  },

  shouldSkipSkillTurn(candidate, strategy) {
    if (!candidate || candidate.action.type !== "SKILL") return false;
    if (candidate.actor && candidate.actor.characterId === "anika" && this.shouldSuppressAnikaClone(candidate, strategy)) {
      return true;
    }
    if (strategy.enemyThreatLevel !== "none") return false;
    return strategy.chargedShrines.length > 0;
  },

  shouldDelaySkillForShrineOrSiege(candidate, strategy) {
    const actor = candidate.actor;
    if (!candidate || !actor || actor.type !== "CHARACTER") return false;
    if (candidate.action.type !== "SKILL") return false;
    if (strategy.enemyThreatLevel !== "none") return false;

    if (strategy.openingShrineWindow && strategy.chargedShrines.length > 0) {
      return true;
    }
    if (strategy.phase === "siege" && this.distance(actor.coord, strategy.enemyAltar.coord) <= 3) {
      return true;
    }
    return false;
  },

  enemyNextTurnAltarThreat(gameState, strategy) {
    const threats = [];
    const legalByPieceId = gameState.legalByPieceId || {};
    for (const enemy of strategy.enemyHeroes || []) {
      const legal = legalByPieceId[enemy.id] || {};
      const attacks = legal.attacks || [];
      const moves = legal.moves || [];
      if (attacks.includes(strategy.myAltar.id)) {
        threats.push(enemy);
        continue;
      }
      if (moves.some((tile) => this.distance(tile, strategy.myAltar.coord) <= 1)) {
        threats.push(enemy);
      }
    }
    return threats;
  },

  isAltarActionEmergency(gameState, candidate, strategy, bestHeroDefenseScore) {
    if (!candidate || candidate.actor.type !== "ALTAR") return false;
    const immediateAttackers = strategy.enemyThreat && strategy.enemyThreat.immediateAttackers
      ? strategy.enemyThreat.immediateAttackers
      : [];
    const nextTurnThreats = this.enemyNextTurnAltarThreat(gameState, strategy);
    const danger = immediateAttackers.length > 0 || nextTurnThreats.length > 0;
    if (!danger) return false;
    return bestHeroDefenseScore < this.WEIGHTS.altarEmergencyFloor;
  },

  bestHeroDefenseScore(gameState, legalActions, strategy) {
    let best = -9999;
    const localThreats = this.localAltarThreats(strategy);
    for (const candidate of legalActions || []) {
      if (!candidate || candidate.actor.type !== "CHARACTER") continue;
      const action = candidate.action;
      let score = 0;
      if (action.type === "ATTACK" && candidate.targetPiece && this.distance(candidate.targetPiece.coord, strategy.myAltar.coord) <= 2) {
        score += this.scoreAttackForStrategy(gameState, candidate, strategy) + 500;
      } else if (action.type === "MOVE" && this.distance(action.toTile, strategy.myAltar.coord) <= 2) {
        score += this.scoreMoveForRole(gameState, strategy.myPlayerId, candidate, strategy) + 280;
      } else if (action.type === "SKILL") {
        if (this.distance(candidate.actor.coord, strategy.myAltar.coord) <= 2 && localThreats.length > 0) {
          score += this.scoreSkillForPathControl(gameState, candidate, strategy);
          score += this.scoreDefensiveSkillPlacement(candidate, strategy);
        }
      }
      if (score > best) best = score;
    }
    return best;
  },

  scoreDefensiveSkillPlacement(candidate, strategy) {
    const actor = candidate.actor;
    const action = candidate.action;
    if (!actor || actor.type !== "CHARACTER" || action.type !== "SKILL") return 0;
    if (strategy.enemyThreatLevel === "none") return 0;
    if (this.distance(actor.coord, strategy.myAltar.coord) > 2) return 0;
    if (this.localAltarThreats(strategy).length === 0) return 0;

    const targetTile = action.targetTile;
    const immediateAttackers = strategy.enemyThreat && strategy.enemyThreat.immediateAttackers
      ? strategy.enemyThreat.immediateAttackers
      : [];
    const nextTurnThreats = strategy.enemyThreatLevel !== "none" ? strategy.enemyHeroes : [];
    const approachTiles = strategy.myAltarApproachTiles || [];

    let score = this.WEIGHTS.defensiveSkillBase;
    if (approachTiles.some((tile) => this.isSameTile(tile, targetTile) || this.distance(tile, targetTile) <= 1)) {
      score += this.WEIGHTS.chokeDefenseBonus;
    }
    if (immediateAttackers.some((enemy) => this.distance(enemy.coord, targetTile) <= 1)) {
      score += this.WEIGHTS.willowDefenseBonus;
    }
    if (nextTurnThreats.some((enemy) => this.distance(enemy.coord, targetTile) <= 2 && this.distance(enemy.coord, strategy.myAltar.coord) <= 4)) {
      score += Math.trunc(this.WEIGHTS.chokeDefenseBonus * 0.8);
    }
    if (this.distance(targetTile, strategy.myAltar.coord) >= 1 && this.distance(targetTile, strategy.myAltar.coord) <= 3) {
      score += this.WEIGHTS.chokeDefenseBonus;
    }
    if (actor.characterId === "jumka") {
      score += this.WEIGHTS.willowDefenseBonus;
    }
    return score;
  },

  scoreSelfTrapSkillPenalty(candidate, strategy) {
    const actor = candidate.actor;
    const action = candidate.action;
    if (!actor || actor.type !== "CHARACTER" || action.type !== "SKILL") return 0;

    const targetTile = action.targetTile;
    let penalty = 0;
    for (const shrineTile of strategy.chargedShrines || []) {
      if (this.isSameTile(targetTile, shrineTile)) {
        penalty += this.WEIGHTS.shrineBlockPenalty;
      }
      if (this.distance(targetTile, shrineTile) <= 1) {
        penalty += Math.trunc(this.WEIGHTS.shrineBlockPenalty * 0.75);
      }
    }

    const shrineRunner = (strategy.myHeroes || []).find((hero) => hero.id === strategy.shrineRunnerId) || this.closestHeroToShrine(strategy);
    if (shrineRunner && strategy.chargedShrines.length > 0) {
      const path = strategy.pathCache && strategy.pathCache[shrineRunner.id]
        ? strategy.pathCache[shrineRunner.id].toShrine
        : null;
      const laneTiles = path && path.path ? path.path.slice(0, 2) : [];
      if (laneTiles.some((tile) => this.isSameTile(tile, targetTile))) {
        penalty += this.WEIGHTS.selfTrapSkillPenalty;
      }
    }

    if (strategy.phase === "siege" && this.distance(targetTile, strategy.enemyAltar.coord) > this.distance(actor.coord, strategy.enemyAltar.coord)) {
      penalty += Math.trunc(this.WEIGHTS.selfTrapSkillPenalty * 0.35);
    }
    return penalty;
  },

  scoreHeroMoveIntent(actor, toTile, strategy, role) {
    if (!actor || actor.type !== "CHARACTER") return 0;
    const heroId = actor.characterId;
    let score = 0;
    if (heroId === "kidu" && strategy.phase === "opening" && strategy.chargedShrines.length > 0) {
      const nearestShrine = this.closestTile(toTile, strategy.chargedShrines);
      if (nearestShrine) score += Math.max(0, 4 - this.distance(toTile, nearestShrine)) * this.WEIGHTS.kiduShrineRunnerBonus;
    }
    if (heroId === "jumka" && strategy.defenseWindow) {
      score += Math.max(0, 4 - this.distance(toTile, strategy.myAltar.coord)) * this.WEIGHTS.jumkaDefenseHoldBonus;
    }
    if (heroId === "faros" && (strategy.defenseWindow || strategy.phase === "opening")) {
      score += Math.max(0, 3 - this.distance(toTile, strategy.center)) * this.WEIGHTS.farosChokeBonus;
    }
    if (heroId === "mahui" && strategy.defenseWindow) {
      score += Math.max(0, 4 - this.distance(toTile, strategy.myAltar.coord)) * this.WEIGHTS.mahuiDefenseTrapBonus;
    }
    if (heroId === "sajik" && (strategy.phase === "conversion" || strategy.phase === "opening")) {
      score += Math.max(0, 3 - this.distance(toTile, strategy.center)) * this.WEIGHTS.sajikControlBonus;
    }
    if (heroId === "anika" && strategy.phase === "conversion") {
      if (!this.shouldHeroStayShrineLocked(actor, strategy)) {
        score += Math.max(0, 3 - this.distance(toTile, strategy.enemyAltar.coord)) * this.WEIGHTS.anikaConversionBonus;
      }
    }
    if (role === "defender" && strategy.defenseWindow) {
      score += this.WEIGHTS.phaseDefenseBonus;
    }
    score += this.escapePressureSwing(actor.coord, toTile, strategy);
    return score;
  },

  scoreHeroAttackIntent(actor, target, strategy, duelEdge) {
    if (!actor || !target) return 0;
    const heroId = actor.characterId;
    let score = 0;
    if (strategy.isNineByNine && duelEdge > 0) score += this.WEIGHTS.nineByNineConversionAttackBonus;
    if (strategy.phase === "siege" && this.distance(actor.coord, strategy.enemyAltar.coord) <= 2) {
      score += this.WEIGHTS.nineByNineSiegeBonus;
    }
    if (heroId === "anika" && strategy.phase === "conversion" && !this.shouldHeroStayShrineLocked(actor, strategy)) {
      score += this.WEIGHTS.anikaConversionBonus;
    }
    if (heroId === "kidu" && this.actorHasCombatBlessing(actor)) score += this.WEIGHTS.kiduShrineRunnerBonus;
    if (heroId === "jumka" && strategy.defenseWindow && this.distance(target.coord, strategy.myAltar.coord) <= 3) {
      score += this.WEIGHTS.jumkaDefenseHoldBonus;
    }
    if (heroId === "mahui" && strategy.defenseWindow) score += this.WEIGHTS.mahuiDefenseTrapBonus;
    if (heroId === "sajik" && (strategy.phase === "conversion" || target.shrineChannel)) score += this.WEIGHTS.sajikControlBonus;
    return score;
  },

  scoreHeroSkillIntent(candidate, strategy) {
    const actor = candidate.actor;
    const action = candidate.action;
    if (!actor || actor.type !== "CHARACTER" || action.type !== "SKILL") return 0;
    const heroId = actor.characterId;
    if (heroId === "anika" && this.shouldSuppressAnikaClone(candidate, strategy)) return -this.WEIGHTS.selfTrapSkillPenalty;
    const targetTile = action.targetTile;
    let score = 0;
    const nearestShrine = this.closestTile(targetTile, strategy.chargedShrines);
    const shrineAdj = nearestShrine ? this.distance(targetTile, nearestShrine) <= 1 : false;
    if (heroId === "jumka") {
      if (strategy.defenseWindow && this.localAltarThreats(strategy).length > 0) {
        score += this.WEIGHTS.willowDefenseBonus + Math.max(0, 4 - this.distance(targetTile, strategy.myAltar.coord)) * 70;
      } else if (shrineAdj) {
        score += Math.trunc(this.WEIGHTS.willowDefenseBonus * 0.45);
      }
    }
    if (heroId === "faros") {
      if (shrineAdj || this.distance(targetTile, strategy.center) <= 1) score += this.WEIGHTS.farosChokeBonus;
      if (strategy.defenseWindow && this.localAltarThreats(strategy).length > 0 && this.distance(targetTile, strategy.myAltar.coord) <= 3) score += Math.trunc(this.WEIGHTS.farosChokeBonus * 0.8);
    }
    if (heroId === "mahui") {
      if (strategy.defenseWindow && this.localAltarThreats(strategy).length > 0 && this.distance(targetTile, strategy.myAltar.coord) <= 3) score += this.WEIGHTS.mahuiDefenseTrapBonus;
      if (shrineAdj) score += Math.trunc(this.WEIGHTS.mahuiDefenseTrapBonus * 0.7);
    }
    if (heroId === "sajik") {
      if (shrineAdj || this.distance(targetTile, strategy.center) <= 1) score += this.WEIGHTS.sajikControlBonus;
      if (this.distance(targetTile, strategy.enemyAltar.coord) <= 3 && strategy.conversionWindow) score += Math.trunc(this.WEIGHTS.sajikControlBonus * 0.8);
    }
    if (heroId === "kidu") {
      if (strategy.phase === "opening" && nearestShrine) score += Math.max(0, 4 - this.distance(targetTile, nearestShrine)) * 55;
      if (this.distance(targetTile, strategy.enemyAltar.coord) <= 3) score += 120;
    }
    if (heroId === "anika" && strategy.conversionWindow && !this.shouldHeroStayShrineLocked(actor, strategy)) {
      score += Math.max(0, 4 - this.distance(targetTile, strategy.enemyAltar.coord)) * 55;
    }
    return score;
  },

  scoreRemoteSkillSpamPenalty(candidate, strategy) {
    const actor = candidate.actor;
    const action = candidate.action;
    if (!actor || actor.type !== "CHARACTER" || action.type !== "SKILL") return 0;
    const targetTile = action.targetTile;
    const localThreats = this.localAltarThreats(strategy);
    const castleRing = this.distance(targetTile, strategy.myAltar.coord) <= 1;
    const nearCastle = this.distance(targetTile, strategy.myAltar.coord) <= 2;
    if (castleRing && localThreats.length > 0) {
      return -this.WEIGHTS.castleRingSkillBonus;
    }
    if (nearCastle && localThreats.length > 0) {
      return -Math.trunc(this.WEIGHTS.castleRingSkillBonus * 0.55);
    }
    if (localThreats.length === 0 && this.distance(actor.coord, strategy.myAltar.coord) > 2) {
      return this.WEIGHTS.remoteSkillSpamPenalty;
    }
    if (localThreats.length === 0 && this.distance(targetTile, strategy.myAltar.coord) > 2) {
      return Math.trunc(this.WEIGHTS.remoteSkillSpamPenalty * 0.75);
    }
    return 0;
  },

  localAltarThreats(strategy) {
    const immediateAttackers = strategy.enemyThreat && strategy.enemyThreat.immediateAttackers
      ? strategy.enemyThreat.immediateAttackers
      : [];
    const localThreats = (strategy.enemyHeroes || []).filter((enemy) => this.distance(enemy.coord, strategy.myAltar.coord) <= 3);
    const seen = {};
    const merged = [];
    for (const enemy of immediateAttackers.concat(localThreats)) {
      if (!enemy || seen[enemy.id]) continue;
      seen[enemy.id] = true;
      merged.push(enemy);
    }
    return merged;
  },

  shouldHeroStayShrineLocked(actor, strategy) {
    if (!actor || actor.type !== "CHARACTER") return false;
    if (!strategy || !strategy.chargedShrines || strategy.chargedShrines.length === 0) return false;
    if (strategy.enemyThreatLevel === "immediate") return false;
    const nearestShrine = this.closestTile(actor.coord, strategy.chargedShrines);
    if (!nearestShrine) return false;
    if (this.distance(actor.coord, nearestShrine) === 0) return false;
    const nearestHero = this.closestHeroToChargedShrine(strategy);
    return actor.id === strategy.shrineRunnerId
      || (nearestHero && actor.id === nearestHero.id)
      || (actor.characterId === "anika" && this.distance(actor.coord, nearestShrine) <= 3);
  },

  shouldSuppressAnikaClone(candidate, strategy) {
    if (!candidate || !candidate.actor || candidate.actor.characterId !== "anika") return false;
    if (candidate.action.type !== "SKILL") return false;
    return this.shouldHeroStayShrineLocked(candidate.actor, strategy);
  },

  shouldPreferCastleFinish(actor, strategy) {
    if (!actor || actor.type !== "CHARACTER") return false;
    const altarDist = this.distance(actor.coord, strategy.enemyAltar.coord);
    if (altarDist <= 2) return true;
    const nearestShrine = this.closestTile(actor.coord, strategy.chargedShrines || []);
    if (!nearestShrine) return altarDist <= 3;
    const shrineDist = this.distance(actor.coord, nearestShrine);
    return altarDist <= 3 && altarDist + 1 <= shrineDist;
  },

  adjacencyThreatPenalty(tile, enemyHeroes) {
    const adjacent = (enemyHeroes || []).filter((enemy) => this.distance(tile, enemy.coord) <= 1).length;
    if (adjacent === 0) return 0;
    let penalty = adjacent * this.WEIGHTS.adjacencyThreatPenalty;
    if (adjacent > 1) {
      penalty += (adjacent - 1) * this.WEIGHTS.overlapThreatPenalty;
    }
    return penalty;
  },

  escapePressureSwing(fromTile, toTile, strategy) {
    const beforeAdjacent = this.countAdjacentPieces(fromTile, strategy.enemyHeroes);
    const afterAdjacent = this.countAdjacentPieces(toTile, strategy.enemyHeroes);
    const beforeSupport = this.countAdjacentPieces(fromTile, strategy.enemyHeroes) - this.countAdjacentPieces(fromTile, strategy.myHeroes);
    const afterSupport = this.countAdjacentPieces(toTile, strategy.enemyHeroes) - this.countAdjacentPieces(toTile, strategy.myHeroes);
    let score = 0;
    if (afterAdjacent < beforeAdjacent) {
      score += (beforeAdjacent - afterAdjacent) * this.WEIGHTS.escapePressureBonus;
    }
    if (afterSupport < beforeSupport) {
      score += (beforeSupport - afterSupport) * Math.trunc(this.WEIGHTS.escapePressureBonus * 0.6);
    }
    return score;
  },

  scoreAltarEscapeMove(fromTile, toTile, strategy) {
    const beforeAdjacent = this.countAdjacentPieces(fromTile, strategy.enemyHeroes);
    const afterAdjacent = this.countAdjacentPieces(toTile, strategy.enemyHeroes);
    const beforeThreat = this.localAltarThreats(strategy).length;
    let score = 0;
    if (afterAdjacent < beforeAdjacent) {
      score += (beforeAdjacent - afterAdjacent) * this.WEIGHTS.altarEscapeBonus;
    }
    if (beforeThreat > 0 && this.distance(toTile, strategy.myAltar.coord) <= 1) {
      score += Math.trunc(this.WEIGHTS.altarEscapeBonus * 0.5);
    }
    const openNeighbors = this.directionVectors().filter((direction) => {
      const next = { x: toTile.x + direction.x, y: toTile.y + direction.y };
      return !this.isVoidTile({ boardSize: 0, activeBounds: strategy.activeBounds }, next, strategy.activeBounds);
    }).length;
    score += openNeighbors * 8;
    return score;
  },

  scoreCenterControl(fromTile, tile, strategy) {
    const before = this.distance(fromTile, strategy.center);
    const after = this.distance(tile, strategy.center);
    return Math.max(0, before - after) * this.WEIGHTS.centerControlBonus;
  },

  scoreInterceptWindow(actor, toTile, strategy, role) {
    if (role === "sieger" && strategy.enemyThreatLevel === "none") return 0;
    const nearestEnemyBefore = this.closestEnemyDistance(actor.coord, strategy.enemyHeroes);
    const nearestEnemyAfter = this.closestEnemyDistance(toTile, strategy.enemyHeroes);
    let score = 0;
    if (nearestEnemyAfter < nearestEnemyBefore) score += this.WEIGHTS.interceptLaneBonus;
    if (strategy.enemyThreatLevel !== "none" && this.distance(toTile, strategy.myAltar.coord) <= 2) {
      score += this.WEIGHTS.blockEnemyRaceBonus;
    }
    return score;
  },

  unsupportedAdvancePenalty(actor, toTile, strategy, role) {
    if (!actor || role === "support" || role === "defender") return 0;
    const allySupport = this.countAdjacentPieces(toTile, strategy.myHeroes, actor.id);
    const enemySupport = this.countAdjacentPieces(toTile, strategy.enemyHeroes);
    if (enemySupport <= allySupport) return 0;
    return (enemySupport - allySupport) * this.WEIGHTS.unsupportedAdvancePenalty;
  },

  shouldTakeAttack(gameState, candidate, strategy) {
    if (!candidate || candidate.action.type !== "ATTACK" || !candidate.targetPiece || candidate.targetPiece.type !== "CHARACTER") return false;
    if (this.isHighPriorityAttack(gameState, candidate, strategy)) return true;
    const duelEdge = this.duelEdgeScore(gameState, candidate, strategy);
    if (strategy.isNineByNine) {
      if (this.actorHasCombatBlessing(candidate.actor)) return true;
      if (duelEdge > 0) return true;
      return false;
    }
    return duelEdge >= 0;
  },

  attackOpensFinalApproach(candidate, strategy) {
    const actor = candidate.actor;
    const target = candidate.targetPiece;
    if (!actor || !target) return false;
    if (this.distance(actor.coord, strategy.enemyAltar.coord) <= 2) return true;
    if (this.distance(target.coord, strategy.enemyAltar.coord) <= 2) return true;
    const siegerPath = strategy.siegerPath ? strategy.siegerPath.path : [];
    return this.distanceToPath(target.coord, siegerPath) <= 1;
  },

  enemyThreatensOurAltar(target, strategy) {
    if (!target || target.type !== "CHARACTER") return false;
    if (this.distance(target.coord, strategy.myAltar.coord) <= 2) return true;
    const enemyLegal = strategy.enemyThreat && strategy.enemyThreat.immediateAttackers ? strategy.enemyThreat.immediateAttackers : [];
    return enemyLegal.some((piece) => piece.id === target.id);
  },

  isHighPriorityAttack(gameState, candidate, strategy) {
    const actor = candidate.actor;
    const target = candidate.targetPiece;
    if (!actor || !target || target.type !== "CHARACTER") return false;
    if (target.shrineChannel || this.isPieceOnChargedShrine(target, gameState)) return true;
    if (this.enemyThreatensOurAltar(target, strategy)) return true;
    if (this.hasBlessing(actor, "CHAOS")) return true;
    if (this.duelEdgeScore(gameState, candidate, strategy) > 0) return true;
    if (this.attackOpensFinalApproach(candidate, strategy)) return true;
    return false;
  },

  isNeutralAttack(candidate, strategy) {
    const actor = candidate.actor;
    const target = candidate.targetPiece;
    if (!actor || !target || target.type !== "CHARACTER") return false;
    const allySupport = this.countAdjacentPieces(target.coord, strategy.myHeroes, actor.id);
    const enemySupport = this.countAdjacentPieces(actor.coord, strategy.enemyHeroes, target.id);
    return allySupport === 0 && enemySupport === 0;
  },

  duelEdgeScore(gameState, candidate, strategy) {
    const actor = candidate.actor;
    const target = candidate.targetPiece;
    if (!actor || !target || target.type !== "CHARACTER") return 0;
    const allySupport = this.countAdjacentPieces(target.coord, strategy.myHeroes, actor.id);
    const enemySupport = this.countAdjacentPieces(actor.coord, strategy.enemyHeroes, target.id);
    const objectiveBonus = (target.shrineChannel ? 2 : 0)
      + (this.isPieceOnChargedShrine(target, gameState) ? 1 : 0)
      + (this.enemyThreatensOurAltar(target, strategy) ? 2 : 0)
      + (this.distance(actor.coord, strategy.enemyAltar.coord) <= 2 ? 1 : 0)
      + (this.attackOpensFinalApproach(candidate, strategy) ? 1 : 0);
    return (allySupport - enemySupport) * 2 + objectiveBonus;
  },
};
