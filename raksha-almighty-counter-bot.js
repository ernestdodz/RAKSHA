/*
 * ===========================================
 * Raksha Almighty Counter Bot (Single-Scan Rules Block)
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
 *    MOVE, ATTACK, or SKILL (castle move also costs the turn).
 * 2) Duels use deterministic seeded RNG.
 * 3) Units do not have per-unit HP bars. A defeated god respawns.
 * 4) Castle defeat ends the game immediately.
 * 5) Player HP exists at match level (starts at 6).
 *    HP is reduced only on direct GOD-vs-GOD attack duel losses.
 *    Skill/autonomous effects (e.g., willow/pillar/clone outcomes) do not reduce player HP.
 * 6) Skills are board objects: they occupy tiles, block movement, and trigger through engine hooks.
 *
 * WIN CONDITIONS
 * - Win immediately by defeating the enemy castle.
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
 *
 * TIP FOR HUMANS + LLMs
 * - Score legal actions from `gameState.legalByPieceId`; avoid inventing actions.
 * - Do not assume unit HP. Use player HP (`gameState.playerHp`) for risk/finish logic.
 * - Use `activeBounds` / `chaordic` to avoid void tiles and plan checkpoint urgency.
 * - If a hero is channeling shrine, avoid moving it away unless a forced win is available.
 */
const bot = {
  botName: "DudurogngMundo",
  botAuthor: "Ernest v1",
  botLore: "A disciplined 13x13 duelist that pressures shrines, splits lanes, and denies fair fights until the board bends.",
  version: "3.0.0",
  lastUpdated: "2026-03-13",

  WEIGHTS: {
    castleWinNow: 100000,
    castlePressure: 250,
    castlePressureRole: 90,
    heroAttack: 900,
    hpFinishPressure: 650,
    attackSupport: 210,
    attackOnShrine: 340,
    attackDefendCastle: 360,
    attackPunishChannel: 460,
    attackWithChaosBlessing: 520,
    neutralAttackPenalty: 520,
    openingNeutralAttackPenalty: 380,
    orderShrineLowHp: 500,
    orderShrineNormal: 170,
    chaosShrineSetup: 360,
    shrineStaging: 150,
    centerControl: 95,
    splitLaneOpening: 120,
    routeToEnemyHero: 110,
    routeToEnemyCastle: 140,
    respawnIntercept: 110,
    castleGuardSpacing: 150,
    skillPlacement: 220,
    skillLaneBlock: 140,
    skillShrineControl: 160,
    skillRespawnTrap: 130,
    defendCastle: 880,
    avoidThreatWhenLowHp: 260,
    channelKeepBonus: 520,
    holdBlessingBonus: 120,
    tiedChaordicControl: 150,
    fallbackCastleScreen: 120,
    castleAnchorPenalty: 420,
    castleThreatBlockBonus: 180,
    shrineDiversionPenalty: 700,
    tierDefenseImpact: 220,
    tierCastleSiege: 90,
    nonEmergencyCastlePenalty: 1400,
    shrineRunnerBonus: 280,
    nonRunnerShrinePenalty: 420,
    badDuelPenalty: 1200,
    unsafeMovePenalty: 420,
    trapMovePenalty: 260,
    defenderCastleShieldBonus: 240,
    defenderInterceptBonus: 180,
    castleUnsafeAdvancePenalty: 900,
    shrineRaceWinnableBonus: 240,
    shrineSoftPressureBonus: 140,
  },

  init() {
    // TIP: Store tiny deterministic caches here if needed; keep them optional and read-only per turn.
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
    const myCastle = this.getMyCastle(gameState, myPlayerId);
    const enemyCastle = this.getEnemyCastle(gameState, myPlayerId);
    if (!myCastle || !enemyCastle) {
      return this.endTurnFallback(gameState, myPlayerId, rng);
    }

    const legalActions = this.collectLegalActions(gameState, myPlayerId);
    if (legalActions.length === 0) {
      return this.endTurnFallback(gameState, myPlayerId, rng);
    }

    // Hard rule: always take immediate castle win.
    const castleWin = legalActions.find((candidate) =>
      candidate.action.type === "ATTACK" && candidate.targetPiece && candidate.targetPiece.type === "CASTLE",
    );
    if (castleWin) {
      return castleWin.action;
    }

    const myHeroes = this.getMyHeroes(gameState, myPlayerId);
    const enemyHeroes = this.getEnemyHeroes(gameState, myPlayerId);
    const myHp = (gameState.playerHp && gameState.playerHp[myPlayerId]) || 6;
    const enemyId = myPlayerId === "P1" ? "P2" : "P1";
    const enemyHp = (gameState.playerHp && gameState.playerHp[enemyId]) || 6;
    const strategy = this.buildStrategyContext(gameState, myPlayerId, myHeroes, enemyHeroes, myCastle, enemyCastle, myHp, enemyHp);

    // If already channeling, avoid moving that hero off shrine unless we can instantly win.
    const channelingHeroIds = this.getChannelingHeroIds(gameState, myHeroes);
    let decisionCandidates = legalActions;
    if (channelingHeroIds.size > 0) {
      decisionCandidates = legalActions.filter((candidate) => {
        if (!channelingHeroIds.has(candidate.actor.id)) return true;
        return candidate.action.type !== "MOVE";
      });
    }

    const pool = this.selectActionPool(gameState, decisionCandidates, {
      myCastle,
      enemyCastle,
      myHeroes,
      enemyHeroes,
      myHp,
      enemyHp,
      strategy,
      preferKeepChannel: channelingHeroIds.size > 0,
      prioritizeLadder: true,
    });
    const context = {
      myCastle,
      enemyCastle,
      myHeroes,
      enemyHeroes,
      myHp,
      enemyHp,
      strategy,
      preferKeepChannel: channelingHeroIds.size > 0,
      prioritizeLadder: true,
    };
    const picked = this.pickByDecisionPipeline(gameState, myPlayerId, pool, context, rng);
    if (picked) return picked;

    return this.endTurnFallback(gameState, myPlayerId, rng);
  },

  pickByDecisionPipeline(gameState, myPlayerId, candidates, context, rng) {
    if (!candidates || candidates.length === 0) return null;
    const byRank = { 5: [], 4: [], 3: [], 2: [], 1: [] };
    for (const candidate of candidates) {
      const tier = this.classifyPriorityTier(gameState, candidate, context);
      const rank = this.priorityTierRank(tier);
      if (!byRank[rank]) byRank[rank] = [];
      byRank[rank].push(candidate);
    }

    const order = [5, 4, 3, 2, 1];
    for (const rank of order) {
      const bucket = (byRank[rank] || []).slice().sort((a, b) => this.actionKey(a.action).localeCompare(this.actionKey(b.action)));
      if (bucket.length === 0) continue;
      const capped = this.capCandidates(bucket, context);
      const scored = this.evaluateActions(gameState, myPlayerId, capped, context);
      if (scored.length > 0) {
        return this.tieBreak(scored, rng);
      }
    }
    return null;
  },

  capCandidates(candidates, context) {
    const limit = this.maxEvalCandidates(context);
    if (candidates.length <= limit) return candidates;
    return candidates.slice(0, limit);
  },

  maxEvalCandidates(context) {
    const compact = Boolean(context && context.strategy && context.strategy.isCompactBoard);
    return compact ? 64 : 90;
  },

  selectActionPool(gameState, candidates, context) {
    const characterActions = candidates.filter((candidate) => candidate.actor.type === "CHARACTER");
    const castleActions = candidates.filter((candidate) => candidate.actor.type === "CASTLE");
    const others = candidates.filter((candidate) => candidate.actor.type !== "CHARACTER" && candidate.actor.type !== "CASTLE");

    if (characterActions.length === 0) {
      return candidates;
    }

    const emergencyCastleActions = castleActions.filter((candidate) => this.isCastleActionEmergency(gameState, candidate, context));
    if (emergencyCastleActions.length > 0) {
      return characterActions.concat(emergencyCastleActions, others);
    }

    const safeCastleMoves = castleActions.filter((candidate) => this.isCastleDefensiveRetreatMove(gameState, candidate, context));
    const pooled = characterActions.concat(safeCastleMoves, others);
    return pooled.length > 0 ? pooled : candidates;
  },

  evaluateActions(gameState, myPlayerId, legalActions, context) {
    const results = [];
    const activeBounds = this.getActiveBounds(gameState);
    const chaosUrgency = this.chaordicUrgencyScale(gameState, context.myHp, context.enemyHp);

    for (const candidate of legalActions) {
      const action = candidate.action;
      const actor = candidate.actor;
      const targetTile = this.actionTargetTile(actor, action, candidate);

      // TIP: Rejecting void tiles here keeps custom bots safe even if game variants expose extra board space.
      if (targetTile && this.isVoidTile(gameState, targetTile, activeBounds)) {
        continue;
      }

      let score = 0;
      if (action.type === "ATTACK") {
        score += this.scoreAttackAction(gameState, candidate, context);
      }

      if (action.type === "MOVE") {
        score += this.scoreMoveAction(gameState, myPlayerId, candidate, context);
      }

      if (action.type === "SKILL") {
        score += this.WEIGHTS.skillPlacement;
        score += this.scoreSkillPlacement(gameState, actor, action.targetTile, context);
      }

      // TIP: Risk tolerance can be tuned by HP; low HP should avoid random melee unless winning.
      if (targetTile && context.myHp <= 2 && this.isThreatenedByEnemy(targetTile, context.enemyHeroes)) {
        score -= this.WEIGHTS.avoidThreatWhenLowHp;
      }

      if (context.preferKeepChannel && actor.shrineChannel && action.type !== "MOVE") {
        score += this.WEIGHTS.channelKeepBonus;
      }
      if (actor.type === "CHARACTER" && this.hasAnyBlessing(actor) && action.type !== "ATTACK") {
        score += this.WEIGHTS.holdBlessingBonus;
      }
      if (context.strategy.tieNearChaordic && action.type !== "ATTACK") {
        score += this.WEIGHTS.tiedChaordicControl;
      }

      if (this.isShrineDiversionCandidate(gameState, candidate, context) && !this.shrineExceptionAllowed(gameState, candidate, context)) {
        score -= Math.trunc(this.WEIGHTS.shrineDiversionPenalty * this.shrinePenaltyScale(candidate, context));
      }

      const role = this.roleForHero(actor, context.strategy);
      if (this.isShrineDiversionCandidate(gameState, candidate, context)) {
        if (role === "shrine") score += this.WEIGHTS.shrineRunnerBonus;
        if (role !== "shrine") score -= Math.trunc(this.WEIGHTS.nonRunnerShrinePenalty * this.shrinePenaltyScale(candidate, context));
        if (this.isShrineRaceWinnable(candidate, context)) {
          score += this.WEIGHTS.shrineRaceWinnableBonus;
        } else if (context.strategy.castleThreat && context.strategy.castleThreat.softPressure && (role === "shrine" || role === "defender")) {
          score += this.WEIGHTS.shrineSoftPressureBonus;
        }
      }
      if (actor.type === "CASTLE" && !this.isCastleActionEmergency(gameState, candidate, context)) {
        score -= this.WEIGHTS.nonEmergencyCastlePenalty;
        if (action.type === "ATTACK") {
          score -= this.WEIGHTS.castleUnsafeAdvancePenalty;
        }
      }

      const tier = this.classifyPriorityTier(gameState, candidate, context);
      const defenseImpact = this.defenseImpactScore(gameState, candidate, context);
      const siegeImpact = this.castleSiegeScore(gameState, candidate, context);
      const tierBase = context.prioritizeLadder ? this.priorityTierBase(tier) : 0;
      const tierAdjust = defenseImpact * this.WEIGHTS.tierDefenseImpact + siegeImpact * this.WEIGHTS.tierCastleSiege;

      score = Math.trunc(score * chaosUrgency);
      score += tierBase + tierAdjust;
      results.push({ action, score, key: this.actionKey(action) });
    }

    results.sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return left.key.localeCompare(right.key);
    });
    return results;
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

    // TIP: If exact duplicate keys exist, seeded rng keeps deterministic replay-safe tie breaks.
    const picked = rng.pick(bestKeyGroup);
    return (picked || bestKeyGroup[0]).action;
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
    const legalByPieceId = gameState.legalByPieceId || gameState.legalActionsByPieceId || {};
    const pieces = gameState.pieces
      .filter((piece) => piece.owner === myPlayerId && piece.type !== "SKILL_OBJECT")
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));

    const enemyById = {};
    for (const piece of gameState.pieces) {
      enemyById[piece.id] = piece;
    }

    const result = [];
    for (const piece of pieces) {
      const legal = legalByPieceId[piece.id] || piece.legal || {};
      const moves = (legal.moves || legal.moveTiles || []).slice().sort(this.compareTiles);
      const attacks = (legal.attacks || legal.attackIds || []).slice().sort();
      const skills = (legal.skills || legal.skillTargets || []).slice().sort(this.compareTiles);

      for (const toTile of moves) {
        result.push({ actor: piece, action: this.move(piece.id, toTile) });
      }
      for (const targetId of attacks) {
        result.push({ actor: piece, action: this.attack(piece.id, targetId), targetPiece: enemyById[targetId] || null });
      }
      if (piece.type === "CHARACTER") {
        const skillId = this.skillIdForHero(piece.characterId);
        for (const targetTile of skills) {
          result.push({ actor: piece, action: this.castSkill(piece.id, skillId, targetTile) });
        }
      }
    }
    if (result.length === 0 && Array.isArray(gameState.legalActions)) {
      const global = gameState.legalActions
        .filter((action) => this.isActionOwnedByPlayer(gameState, action, myPlayerId))
        .slice()
        .sort((a, b) => this.actionKey(a).localeCompare(this.actionKey(b)))
        .map((action) => {
          const actor = this.resolveActionActor(gameState, action) || { id: "unknown", type: "CHARACTER", coord: { x: 0, y: 0 } };
          const targetPiece = action.type === "ATTACK" ? (gameState.pieces.find((piece) => piece.id === action.targetId) || null) : null;
          return { actor, action, targetPiece };
        });
      return global;
    }
    return result;
  },

  isActionOwnedByPlayer(gameState, action, myPlayerId) {
    const actor = this.resolveActionActor(gameState, action);
    return Boolean(actor && actor.owner === myPlayerId);
  },

  resolveActionActor(gameState, action) {
    if (!action) return null;
    const id = action.pieceId || action.attackerId || action.heroId;
    if (!id) return null;
    return gameState.pieces.find((piece) => piece.id === id) || null;
  },

  getEnemyCastle(gameState, myPlayerId) {
    return gameState.pieces.find((piece) => piece.owner !== myPlayerId && piece.type === "CASTLE");
  },

  getMyCastle(gameState, myPlayerId) {
    return gameState.pieces.find((piece) => piece.owner === myPlayerId && piece.type === "CASTLE");
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

  getChannelingHeroIds(gameState, heroes) {
    const set = new Set();
    for (const hero of heroes) {
      if (hero.shrineChannel && hero.shrineChannel.startedTurnNumber < gameState.turnNumber) {
        set.add(hero.id);
      }
    }
    return set;
  },

  getActiveBounds(gameState) {
    if (gameState.activeBounds) {
      return gameState.activeBounds;
    }
    return {
      minX: 0,
      maxX: gameState.boardSize - 1,
      minY: 0,
      maxY: gameState.boardSize - 1,
    };
  },

  getRoundsToNextChaordicCheckpoint(gameState) {
    if (!gameState.chaordic || typeof gameState.chaordic.roundsToCheckpoint !== "number") {
      return null;
    }
    return gameState.chaordic.roundsToCheckpoint;
  },

  getCurrentStageBoardSizeEquivalent(gameState) {
    const bounds = this.getActiveBounds(gameState);
    return Math.max(1, bounds.maxX - bounds.minX + 1);
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
    return Boolean(gameState.occupiedByTileKey[`${tile.x},${tile.y}`]);
  },

  isThreatenedByEnemy(tile, enemyHeroes) {
    return enemyHeroes.some((enemy) => this.isAdjacent(tile, enemy.coord));
  },

  isCastleThreatened(gameState, myCastle, enemyHeroes) {
    return enemyHeroes.some((enemy) => this.distance(enemy.coord, myCastle.coord) <= 2);
  },

  getEnemyImmediateCastleAttackers(gameState, myCastle, enemyHeroes) {
    const attackers = [];
    for (const enemy of enemyHeroes) {
      const legal = gameState.legalByPieceId && gameState.legalByPieceId[enemy.id];
      const attacks = (legal && legal.attacks) || [];
      if (attacks.includes(myCastle.id)) attackers.push(enemy);
    }
    return attackers.sort((a, b) => a.id.localeCompare(b.id));
  },

  isEnemyCastleThreatCritical(gameState, myCastle, enemyHeroes, myHp) {
    const immediateAttackers = this.getEnemyImmediateCastleAttackers(gameState, myCastle, enemyHeroes);
    const fallbackNear = enemyHeroes.filter((enemy) => this.distance(enemy.coord, myCastle.coord) <= 2);
    let nextCycleThreats = 0;

    for (const enemy of enemyHeroes) {
      if (this.distance(enemy.coord, myCastle.coord) <= 2) {
        nextCycleThreats += 1;
        continue;
      }
      const legal = gameState.legalByPieceId && gameState.legalByPieceId[enemy.id];
      const moves = (legal && legal.moves) || [];
      if (moves.some((tile) => this.distance(tile, myCastle.coord) <= 2)) {
        nextCycleThreats += 1;
      }
    }

    const immediateDanger = immediateAttackers.length > 0;
    const softPressure = !immediateDanger && (nextCycleThreats >= 2 || fallbackNear.length > 0);
    const criticalDanger = immediateAttackers.length >= 2 || (immediateDanger && (myHp || 6) <= 3);
    const present = immediateDanger || softPressure || fallbackNear.length > 0;
    return {
      present,
      critical: criticalDanger,
      immediateDanger,
      criticalDanger,
      softPressure,
      immediateAttackers,
      immediateCount: Math.max(immediateAttackers.length, fallbackNear.length),
      nextCycleThreats,
    };
  },

  buildStrategyContext(gameState, myPlayerId, myHeroes, enemyHeroes, myCastle, enemyCastle, myHp, enemyHp) {
    const center = this.boardCenter(gameState);
    const pressureHero = this.selectHeroByRole(myHeroes, "pressure");
    const shrineRunner = this.selectHeroByRole(myHeroes, "shrine", pressureHero && pressureHero.id);
    const defenderPool = myHeroes.filter((hero) =>
      hero.id !== (pressureHero && pressureHero.id) && hero.id !== (shrineRunner && shrineRunner.id),
    );
    const defenderHero = this.selectHeroByRole(defenderPool, "defender");
    const controlPool = myHeroes.filter((hero) => hero.id !== (pressureHero && pressureHero.id) && hero.id !== (shrineRunner && shrineRunner.id) && hero.id !== (defenderHero && defenderHero.id));
    const controlHero = this.selectHeroByRole(controlPool, "control");
    const myTurnIndex = this.estimateMyTurnIndex(gameState, myPlayerId);
    const castleThreat = this.isEnemyCastleThreatCritical(gameState, myCastle, enemyHeroes, myHp);
    const boardSize = typeof gameState.boardSize === "number" ? gameState.boardSize : 13;
    const isCompactBoard = boardSize <= 9;
    const chargedShrines = this.getChargedShrines(gameState);
    const fast = this.buildFastTurnCache(gameState, myHeroes, enemyHeroes, myCastle, enemyCastle, chargedShrines);
    return {
      center,
      myTurnIndex,
      openingPhase: isCompactBoard ? myTurnIndex <= 4 : myTurnIndex <= 5,
      isCompactBoard,
      pressureHeroId: pressureHero ? pressureHero.id : null,
      shrineRunnerId: shrineRunner ? shrineRunner.id : null,
      defenderHeroId: defenderHero ? defenderHero.id : null,
      controlHeroId: controlHero ? controlHero.id : null,
      tieNearChaordic: Boolean(gameState.chaordic && gameState.chaordic.hpTied && this.getRoundsToNextChaordicCheckpoint(gameState) !== null && this.getRoundsToNextChaordicCheckpoint(gameState) <= 2),
      myHp,
      enemyHp,
      hpDelta: myHp - enemyHp,
      enemySpawnTiles: enemyHeroes.map((hero) => this.getSpawnTile(hero)).filter(Boolean),
      chargedShrines,
      castleThreat,
      fast,
      myCastle,
      enemyCastle,
    };
  },

  buildFastTurnCache(gameState, myHeroes, enemyHeroes, myCastle, enemyCastle, chargedShrines) {
    const bounds = this.getActiveBounds(gameState);
    const enemyAdjByTileKey = {};
    const allyAdjByTileKey = {};

    for (const enemy of enemyHeroes) {
      for (const dir of this.directionVectors()) {
        const tile = { x: enemy.coord.x + dir.x, y: enemy.coord.y + dir.y };
        if (this.isVoidTile(gameState, tile, bounds)) continue;
        const key = `${tile.x},${tile.y}`;
        enemyAdjByTileKey[key] = (enemyAdjByTileKey[key] || 0) + 1;
      }
    }
    for (const ally of myHeroes) {
      for (const dir of this.directionVectors()) {
        const tile = { x: ally.coord.x + dir.x, y: ally.coord.y + dir.y };
        if (this.isVoidTile(gameState, tile, bounds)) continue;
        const key = `${tile.x},${tile.y}`;
        allyAdjByTileKey[key] = (allyAdjByTileKey[key] || 0) + 1;
      }
    }

    const enemyCastleGoals = this.adjacentGoals(enemyCastle.coord);
    const nearestEnemyGoals = enemyHeroes.map((enemy) => enemy.coord);
    const shrineGoals = (chargedShrines || []).slice();
    const castleAnchorGoals = [myCastle.coord];
    const castleSpawn = this.getSpawnTile(myCastle);
    if (castleSpawn) castleAnchorGoals.push(castleSpawn);
    const distEnemyCastleField = this.computeDistanceField(gameState, enemyCastleGoals, true);
    const distMyCastleField = this.computeDistanceField(gameState, [myCastle.coord], true);
    const nearestEnemyField = this.computeDistanceField(gameState, nearestEnemyGoals, true);
    const shrineField = this.computeDistanceField(gameState, shrineGoals, true);
    const castleAnchorField = this.computeDistanceField(gameState, castleAnchorGoals, true);
    const nearestMyShrineEta = this.nearestPieceEtaToField(myHeroes, shrineField);
    const nearestEnemyShrineEta = this.nearestPieceEtaToField(enemyHeroes, shrineField);

    const nearestEnemyDistByTileKey = {};
    const distEnemyCastleByTileKey = {};
    const distMyCastleByTileKey = {};
    const shrineDistByTileKey = {};
    const distCastleAnchorByTileKey = {};
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const key = `${x},${y}`;
        nearestEnemyDistByTileKey[key] = nearestEnemyField[key] !== undefined ? nearestEnemyField[key] : 99;
        distEnemyCastleByTileKey[key] = distEnemyCastleField[key] !== undefined ? distEnemyCastleField[key] : 99;
        distMyCastleByTileKey[key] = distMyCastleField[key] !== undefined ? distMyCastleField[key] : 99;
        shrineDistByTileKey[key] = shrineField[key] !== undefined ? shrineField[key] : 99;
        distCastleAnchorByTileKey[key] = castleAnchorField[key] !== undefined ? castleAnchorField[key] : 99;
      }
    }

    return {
      bounds,
      enemyAdjByTileKey,
      allyAdjByTileKey,
      nearestEnemyDistByTileKey,
      distEnemyCastleByTileKey,
      distMyCastleByTileKey,
      shrineDistByTileKey,
      distCastleAnchorByTileKey,
      nearestMyShrineEta,
      nearestEnemyShrineEta,
    };
  },

  nearestPieceEtaToField(pieces, field) {
    if (!pieces || pieces.length === 0) return 99;
    let best = 99;
    for (const piece of pieces) {
      const key = `${piece.coord.x},${piece.coord.y}`;
      const eta = field[key] !== undefined ? field[key] : 99;
      if (eta < best) best = eta;
    }
    return best;
  },

  adjacentGoals(tile) {
    if (!tile) return [];
    const goals = [];
    for (const dir of this.directionVectors()) {
      goals.push({ x: tile.x + dir.x, y: tile.y + dir.y });
    }
    return goals;
  },

  computeDistanceField(gameState, goalTiles, allowGoalBlocked) {
    const field = {};
    if (!goalTiles || goalTiles.length === 0) return field;
    const bounds = this.getActiveBounds(gameState);
    const queue = [];
    const visited = new Set();

    const orderedGoals = goalTiles
      .filter((tile) => tile && !this.isVoidTile(gameState, tile, bounds))
      .slice()
      .sort(this.compareTiles);
    for (const goal of orderedGoals) {
      const key = `${goal.x},${goal.y}`;
      if (visited.has(key)) continue;
      if (!allowGoalBlocked && this.isTileBlocked(gameState, goal)) continue;
      visited.add(key);
      field[key] = 0;
      queue.push(goal);
    }

    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      const currentKey = `${current.x},${current.y}`;
      const baseDist = field[currentKey];
      for (const dir of this.directionVectors()) {
        const next = { x: current.x + dir.x, y: current.y + dir.y };
        const nextKey = `${next.x},${next.y}`;
        if (visited.has(nextKey)) continue;
        if (this.isVoidTile(gameState, next, bounds)) continue;
        if (this.isTileBlocked(gameState, next)) continue;
        visited.add(nextKey);
        field[nextKey] = baseDist + 1;
        queue.push(next);
      }
    }
    return field;
  },

  isCastleActionEmergency(gameState, candidate, context) {
    const actor = candidate.actor;
    const action = candidate.action;
    if (actor.type !== "CASTLE") return false;
    const threat = context.strategy.castleThreat || { immediateDanger: false, criticalDanger: false };
    if (!(threat.immediateDanger || threat.criticalDanger)) return false;
    if (action.type === "ATTACK" && candidate.targetPiece && candidate.targetPiece.type === "CHARACTER") {
      return this.distance(candidate.targetPiece.coord, context.myCastle.coord) <= 2 || this.defenseImpactScore(gameState, candidate, context) > 0;
    }
    return this.defenseImpactScore(gameState, candidate, context) > 0;
  },

  isCastleDefensiveRetreatMove(gameState, candidate, context) {
    const actor = candidate.actor;
    const action = candidate.action;
    if (actor.type !== "CASTLE" || action.type !== "MOVE") return false;
    const threat = context.strategy.castleThreat || { immediateDanger: false, criticalDanger: false };
    if (threat.immediateDanger || threat.criticalDanger) return false;

    const toTile = action.toTile;
    const fast = (context.strategy && context.strategy.fast) || {};
    const nearEnemyBefore = this.closestPiece(context.enemyHeroes, actor.coord);
    const nearEnemyAfter = this.closestPiece(context.enemyHeroes, toTile);
    const beforeDistEnemy = nearEnemyBefore ? this.distance(actor.coord, nearEnemyBefore.coord) : 99;
    const afterDistEnemy = nearEnemyAfter ? this.distance(toTile, nearEnemyAfter.coord) : 99;
    const toKey = `${toTile.x},${toTile.y}`;
    const anchorDist = (fast.distCastleAnchorByTileKey && fast.distCastleAnchorByTileKey[toKey] !== undefined)
      ? fast.distCastleAnchorByTileKey[toKey]
      : this.distance(toTile, context.myCastle.coord);
    return afterDistEnemy >= beforeDistEnemy && anchorDist <= 1;
  },

  priorityTierRank(tier) {
    if (tier === "WIN_NOW") return 5;
    if (tier === "SURVIVE_NOW") return 4;
    if (tier === "CHARACTER_OBJECTIVE") return 3;
    if (tier === "CASTLE_ACTION") return 2;
    return 1;
  },

  priorityTierBase(tier) {
    if (tier === "WIN_NOW") return 2000000;
    if (tier === "SURVIVE_NOW") return 1500000;
    if (tier === "CHARACTER_OBJECTIVE") return 900000;
    if (tier === "CASTLE_ACTION") return 550000;
    return 150000;
  },

  classifyPriorityTier(gameState, candidate, context) {
    const action = candidate.action;
    const actor = candidate.actor;
    const target = candidate.targetPiece;
    if (action.type === "ATTACK" && target && target.type === "CASTLE") {
      return "WIN_NOW";
    }

    if (action.type === "ATTACK" && actor.type === "CHARACTER" && !this.isAttackException(gameState, candidate, context)) {
      const duelEdge = this.attackAdvantageScore(gameState, candidate, context);
      if (duelEdge <= 0) return "FALLBACK";
    }

    if (actor.type === "CASTLE" && !this.isCastleActionEmergency(gameState, candidate, context)) {
      return "FALLBACK";
    }

    const threat = context.strategy.castleThreat || { immediateDanger: false, criticalDanger: false, softPressure: false };
    const defenseImpact = this.defenseImpactScore(gameState, candidate, context);
    if (threat.criticalDanger) {
      return defenseImpact > 0 ? "SURVIVE_NOW" : "FALLBACK";
    }
    if (threat.immediateDanger && defenseImpact > 0) {
      return "SURVIVE_NOW";
    }

    if (this.isShrineDiversionCandidate(gameState, candidate, context)) {
      return this.shrineExceptionAllowed(gameState, candidate, context) ? "CHARACTER_OBJECTIVE" : "FALLBACK";
    }

    if (actor.type === "CASTLE") {
      return this.isCastleActionEmergency(gameState, candidate, context) ? "CASTLE_ACTION" : "FALLBACK";
    }
    return "CHARACTER_OBJECTIVE";
  },

  defenseImpactScore(gameState, candidate, context) {
    const action = candidate.action;
    const actor = candidate.actor;
    const target = candidate.targetPiece;
    const myCastle = context.myCastle;
    const threat = context.strategy.castleThreat || { immediateAttackers: [], immediateCount: 0, nextCycleThreats: 0 };
    let score = 0;

    if (action.type === "ATTACK" && target && target.type === "CHARACTER") {
      if (threat.immediateAttackers.some((enemy) => enemy.id === target.id)) score += 3;
      if (this.distance(target.coord, myCastle.coord) <= 2) score += 2;
    }

    if (action.type === "MOVE") {
      const toTile = action.toTile;
      if (this.distance(toTile, myCastle.coord) <= 2) score += 2;
      if (threat.immediateAttackers.some((enemy) => this.isAdjacent(enemy.coord, toTile))) score += 2;
      if (actor.type === "CASTLE" && this.distance(toTile, myCastle.coord) <= 1) score += 2;
    }

    if (action.type === "SKILL" && action.targetTile) {
      if (this.distance(action.targetTile, myCastle.coord) <= 2) score += 2;
      if (threat.immediateAttackers.some((enemy) => this.distance(enemy.coord, action.targetTile) <= 1)) score += 2;
    }

    if (threat.critical && score === 0 && threat.nextCycleThreats > 0 && action.type === "MOVE" && this.distance(action.toTile, myCastle.coord) <= 3) {
      score += 1;
    }
    return score;
  },

  castleSiegeScore(gameState, candidate, context) {
    const action = candidate.action;
    const actor = candidate.actor;
    const target = candidate.targetPiece;
    const enemyCastle = context.enemyCastle;
    const role = this.roleForHero(actor, context.strategy);
    let score = 0;

    if (action.type === "ATTACK") {
      if (target && target.type === "CASTLE") return 10;
      if (target && actor.type === "CHARACTER" && this.distance(actor.coord, enemyCastle.coord) <= 2) score += 5;
    }

    if (action.type === "MOVE") {
      const before = this.distance(actor.coord, enemyCastle.coord);
      const after = this.distance(action.toTile, enemyCastle.coord);
      score += Math.max(0, before - after) * 2;
      if (actor.type === "CHARACTER" && after <= 1) score += 4;
    }

    if (action.type === "SKILL" && action.targetTile) {
      const dist = this.distance(action.targetTile, enemyCastle.coord);
      score += Math.max(0, 3 - dist);
    }

    if (actor.type === "CHARACTER" && role === "defender") {
      return Math.trunc(score * 0.2);
    }
    if (actor.type === "CHARACTER" && role === "shrine") {
      return Math.trunc(score * 0.45);
    }
    return score;
  },

  isShrineDiversionCandidate(gameState, candidate, context) {
    const action = candidate.action;
    const actor = candidate.actor;
    if (actor.type !== "CHARACTER") return false;

    if (action.type === "MOVE") {
      const chargedShrines = context.strategy.chargedShrines || [];
      const nearest = this.closestTile(action.toTile, chargedShrines);
      if (!nearest) return false;
      const before = this.closestDistance(actor.coord, chargedShrines);
      const after = this.closestDistance(action.toTile, chargedShrines);
      return after === 0 || (before !== null && after < before);
    }

    return false;
  },

  shrinePenaltyScale(candidate, context) {
    const contest = this.isShrineContested(context);
    const threat = context && context.strategy && context.strategy.castleThreat ? context.strategy.castleThreat : { immediateDanger: false, criticalDanger: false };
    const role = this.roleForHero(candidate.actor, context.strategy);
    if (threat.immediateDanger || threat.criticalDanger) return 1;
    if (!contest && role === "shrine") return 0.2;
    if (!contest && role === "defender") return 0.45;
    if (!contest) return 0.65;
    return 1;
  },

  isShrineContested(context) {
    const fast = context && context.strategy && context.strategy.fast;
    if (!fast) return true;
    const myEta = typeof fast.nearestMyShrineEta === "number" ? fast.nearestMyShrineEta : 99;
    const enemyEta = typeof fast.nearestEnemyShrineEta === "number" ? fast.nearestEnemyShrineEta : 99;
    return Math.abs(myEta - enemyEta) <= 1;
  },

  isShrineRaceWinnable(candidate, context) {
    const action = candidate.action;
    if (action.type !== "MOVE") return false;
    const fast = context && context.strategy && context.strategy.fast;
    if (!fast || !context.strategy || !context.strategy.chargedShrines || context.strategy.chargedShrines.length === 0) return false;
    const toKey = `${action.toTile.x},${action.toTile.y}`;
    const myEtaAfter = fast.shrineDistByTileKey && fast.shrineDistByTileKey[toKey] !== undefined ? fast.shrineDistByTileKey[toKey] : 99;
    const enemyEta = typeof fast.nearestEnemyShrineEta === "number" ? fast.nearestEnemyShrineEta : 99;
    return myEtaAfter <= enemyEta + 1;
  },

  isLowRiskShrineMove(candidate, context) {
    const action = candidate.action;
    if (action.type !== "MOVE") return false;
    const fast = context && context.strategy && context.strategy.fast;
    const toKey = `${action.toTile.x},${action.toTile.y}`;
    const enemyAdj = (fast && fast.enemyAdjByTileKey && fast.enemyAdjByTileKey[toKey]) || this.countAdjacentEnemiesToTile(action.toTile, context.enemyHeroes);
    const allyAdj = (fast && fast.allyAdjByTileKey && fast.allyAdjByTileKey[toKey]) || this.countAdjacentAllies(action.toTile, context.myHeroes, candidate.actor.id);
    return enemyAdj <= allyAdj + 1;
  },

  shrineExceptionAllowed(gameState, candidate, context) {
    const actor = candidate.actor;
    if (actor.type !== "CHARACTER") return false;
    const role = this.roleForHero(actor, context.strategy);
    const threat = context.strategy.castleThreat || { immediateDanger: false, criticalDanger: false, softPressure: false };
    const myHp = context.myHp;
    if (myHp <= 2) return true;
    if (this.isEnemyChannelingChargedShrine(gameState, context.enemyHeroes)) return true;
    if ((threat.immediateDanger || threat.criticalDanger) && role !== "shrine") return false;
    if (threat.softPressure && (role === "shrine" || role === "defender")) {
      return this.isShrineRaceWinnable(candidate, context) || this.isLowRiskShrineMove(candidate, context);
    }
    if (role === "defender" && this.isLowRiskShrineMove(candidate, context) && this.isShrineRaceWinnable(candidate, context) && !threat.immediateDanger) return true;
    if (role === "shrine") return true;
    const siege = this.castleSiegeScore(gameState, candidate, context);
    return siege >= 6;
  },

  isEnemyChannelingChargedShrine(gameState, enemyHeroes) {
    const charged = this.getChargedShrines(gameState);
    if (charged.length === 0) return false;
    return enemyHeroes.some((enemy) => enemy.shrineChannel && charged.some((tile) => this.isSameTile(enemy.coord, tile)));
  },

  isAttackException(gameState, candidate, context) {
    const actor = candidate.actor;
    const target = candidate.targetPiece;
    if (!target || actor.type !== "CHARACTER") return false;
    if (target.type === "CASTLE") return true;
    if (context.enemyHp <= 1) return true;
    if (this.actorHasChaosBlessing(actor)) return true;
    if (target.shrineChannel) return true;
    if (this.isPieceOnChargedShrine(target, gameState)) return true;
    if (this.distance(target.coord, context.myCastle.coord) <= 2) return true;
    if (this.distance(actor.coord, context.enemyCastle.coord) <= 1) return true;
    return false;
  },

  attackAdvantageScore(gameState, candidate, context) {
    const actor = candidate.actor;
    const target = candidate.targetPiece;
    if (!actor || !target) return 0;

    const allySupport = this.countAdjacentAllies(target.coord, context.myHeroes, actor.id);
    const enemySupport = this.countAdjacentAllies(actor.coord, context.enemyHeroes, target.id);
    const objectiveBonus = (target.shrineChannel ? 2 : 0)
      + (this.isPieceOnChargedShrine(target, gameState) ? 1 : 0)
      + (this.distance(target.coord, context.myCastle.coord) <= 2 ? 2 : 0)
      + (this.distance(actor.coord, context.enemyCastle.coord) <= 1 ? 1 : 0);
    const exposurePenalty = Math.max(0, this.countAdjacentEnemiesToTile(target.coord, context.enemyHeroes, target.id) - allySupport);

    return (allySupport - enemySupport) * 2 + objectiveBonus - exposurePenalty;
  },

  scoreAttackAction(gameState, candidate, context) {
    const actor = candidate.actor;
    const target = candidate.targetPiece;
    if (!target) return 0;
    if (target.type === "CASTLE") return this.WEIGHTS.castleWinNow;

    let score = this.WEIGHTS.heroAttack;
    if (context.enemyHp <= 1) score += this.WEIGHTS.hpFinishPressure;
    if (this.actorHasChaosBlessing(actor)) score += this.WEIGHTS.attackWithChaosBlessing;
    if (this.isCastleThreatened(gameState, context.myCastle, [target])) score += this.WEIGHTS.attackDefendCastle;
    if (this.isPieceOnChargedShrine(target, gameState)) score += this.WEIGHTS.attackOnShrine;
    if (target.shrineChannel) score += this.WEIGHTS.attackPunishChannel;

    const allySupport = this.countAdjacentAllies(target.coord, context.myHeroes, actor.id);
    const enemySupport = this.countAdjacentAllies(actor.coord, context.enemyHeroes, target.id);
    score += allySupport * this.WEIGHTS.attackSupport;
    score -= enemySupport * Math.trunc(this.WEIGHTS.attackSupport * 0.7);

    const neutralFight = allySupport === 0 && enemySupport === 0;
    const createsFinishPressure = context.enemyHp <= 1;
    const shrineOrCastleSwing = this.isPieceOnChargedShrine(target, gameState) || this.distance(target.coord, context.myCastle.coord) <= 2 || this.distance(actor.coord, context.enemyCastle.coord) <= 2;
    if (neutralFight && !createsFinishPressure && !shrineOrCastleSwing) {
      score -= this.WEIGHTS.neutralAttackPenalty;
      if (context.strategy.openingPhase) score -= this.WEIGHTS.openingNeutralAttackPenalty;
    }

    if (context.strategy.hpDelta > 0 && neutralFight) {
      score -= Math.trunc(this.WEIGHTS.neutralAttackPenalty * 0.7);
    }
    if (context.strategy.hpDelta < 0 && this.distance(actor.coord, context.enemyCastle.coord) <= 2) {
      score += Math.trunc(this.WEIGHTS.heroAttack * 0.35);
    }

    const duelEdge = this.attackAdvantageScore(gameState, candidate, context);
    score += duelEdge * 180;
    if (duelEdge <= 0 && !this.isAttackException(gameState, candidate, context)) {
      score -= this.WEIGHTS.badDuelPenalty;
    }

    return score;
  },

  scoreMoveAction(gameState, myPlayerId, candidate, context) {
    const actor = candidate.actor;
    const toTile = candidate.action.toTile;
    const strategy = context.strategy;
    const role = this.roleForHero(actor, strategy);
    const fast = strategy.fast || {};
    const fromKey = `${actor.coord.x},${actor.coord.y}`;
    const toKey = `${toTile.x},${toTile.y}`;
    let score = 0;

    const distBeforeCastle = (fast.distEnemyCastleByTileKey && fast.distEnemyCastleByTileKey[fromKey]) || this.distance(actor.coord, context.enemyCastle.coord);
    const distAfterCastle = (fast.distEnemyCastleByTileKey && fast.distEnemyCastleByTileKey[toKey]) || this.distance(toTile, context.enemyCastle.coord);
    const castleDelta = Math.max(0, distBeforeCastle - distAfterCastle);
    const threatNow = context.strategy.castleThreat && (context.strategy.castleThreat.immediateDanger || context.strategy.castleThreat.criticalDanger);
    if (role === "pressure") {
      score += castleDelta * this.WEIGHTS.castlePressure;
      score += castleDelta * this.WEIGHTS.castlePressureRole;
    } else if (role === "shrine") {
      score += castleDelta * Math.trunc(this.WEIGHTS.castlePressure * 0.2);
    } else if (role === "defender") {
      if (threatNow) {
        score += castleDelta * Math.trunc(this.WEIGHTS.castlePressure * 0.2);
      } else if (distAfterCastle < distBeforeCastle) {
        score -= Math.trunc(this.WEIGHTS.castlePressure * 0.45);
      }
    } else {
      score += castleDelta * Math.trunc(this.WEIGHTS.castlePressure * 0.35);
    }

    if (actor.type === "CHARACTER") {
      const distBeforeCenter = this.distance(actor.coord, strategy.center);
      const distAfterCenter = this.distance(toTile, strategy.center);
      score += Math.max(0, distBeforeCenter - distAfterCenter) * this.WEIGHTS.centerControl;

      const nearestCharged = this.closestTile(toTile, strategy.chargedShrines);
      if (nearestCharged) {
        const beforeShrine = (fast.shrineDistByTileKey && fast.shrineDistByTileKey[fromKey] !== undefined)
          ? fast.shrineDistByTileKey[fromKey]
          : this.distance(actor.coord, nearestCharged);
        const afterShrine = (fast.shrineDistByTileKey && fast.shrineDistByTileKey[toKey] !== undefined)
          ? fast.shrineDistByTileKey[toKey]
          : this.distance(toTile, nearestCharged);
        if (afterShrine === 0) {
          const shrineScore = this.scoreShrineMove(gameState, myPlayerId, actor, toTile, context.myHp);
          score += role === "shrine" ? shrineScore + this.WEIGHTS.shrineRunnerBonus : Math.trunc(shrineScore * 0.5);
        } else if (afterShrine === 1 && afterShrine < beforeShrine) {
          score += role === "shrine" ? this.WEIGHTS.shrineStaging + Math.trunc(this.WEIGHTS.shrineRunnerBonus * 0.45) : Math.trunc(this.WEIGHTS.shrineStaging * 0.6);
        }
      }

      const otherHero = context.myHeroes.find((hero) => hero.id !== actor.id);
      if (strategy.openingPhase && otherHero) {
        const beforeSpacing = this.distance(actor.coord, otherHero.coord);
        const afterSpacing = this.distance(toTile, otherHero.coord);
        const desiredOpeningSpacing = strategy.isCompactBoard ? 2 : 3;
        if (afterSpacing > beforeSpacing && afterSpacing >= desiredOpeningSpacing) {
          score += this.WEIGHTS.splitLaneOpening;
        }
      }

      const nearestEnemyBefore = (fast.nearestEnemyDistByTileKey && fast.nearestEnemyDistByTileKey[fromKey]) || 99;
      const nearestEnemyAfter = (fast.nearestEnemyDistByTileKey && fast.nearestEnemyDistByTileKey[toKey]) || 99;
      if (role === "pressure" && distAfterCastle < distBeforeCastle) {
        score += role === "pressure" ? this.WEIGHTS.routeToEnemyCastle : Math.trunc(this.WEIGHTS.routeToEnemyCastle * 0.45);
      }
      if (role === "shrine" && distAfterCastle < distBeforeCastle && !this.isShrineDiversionCandidate(gameState, candidate, context)) {
        score -= Math.trunc(this.WEIGHTS.routeToEnemyCastle * 0.5);
      }
      if (role === "defender" && !threatNow && distAfterCastle < distBeforeCastle) {
        score -= Math.trunc(this.WEIGHTS.routeToEnemyCastle * 0.65);
      }
      if (nearestEnemyAfter < nearestEnemyBefore) {
        score += role === "control" ? this.WEIGHTS.routeToEnemyHero : Math.trunc(this.WEIGHTS.routeToEnemyHero * 0.5);
      }

      const spawnTarget = this.closestTile(toTile, strategy.enemySpawnTiles);
      if (spawnTarget) {
        const beforeSpawn = this.distance(actor.coord, spawnTarget);
        const afterSpawn = this.distance(toTile, spawnTarget);
        if (afterSpawn < beforeSpawn && afterSpawn <= 4) {
          score += this.WEIGHTS.respawnIntercept;
        }
      }

      const enemyAdj = (fast.enemyAdjByTileKey && fast.enemyAdjByTileKey[toKey]) || this.countAdjacentEnemiesToTile(toTile, context.enemyHeroes);
      const allyAdj = (fast.allyAdjByTileKey && fast.allyAdjByTileKey[toKey]) || this.countAdjacentAllies(toTile, context.myHeroes, actor.id);
      const blockedNeighbors = this.countBlockedNeighbors(gameState, toTile, strategy.fast && strategy.fast.bounds);
      if (enemyAdj >= 2 && allyAdj === 0) score -= this.WEIGHTS.unsafeMovePenalty;
      if (blockedNeighbors >= 6 && enemyAdj >= 1) score -= this.WEIGHTS.trapMovePenalty;

      if (role === "defender") {
        const beforeCastle = this.distance(actor.coord, context.myCastle.coord);
        const afterCastle = this.distance(toTile, context.myCastle.coord);
        if (threatNow && afterCastle < beforeCastle && afterCastle <= 2) {
          score += this.WEIGHTS.defenderCastleShieldBonus;
        }
        if (!threatNow && afterCastle > beforeCastle && afterCastle >= 3) {
          score -= Math.trunc(this.WEIGHTS.defenderCastleShieldBonus * 0.7);
        }
        const nearThreatBefore = this.closestPiece(context.strategy.castleThreat.immediateAttackers || context.enemyHeroes, actor.coord);
        const nearThreatAfter = this.closestPiece(context.strategy.castleThreat.immediateAttackers || context.enemyHeroes, toTile);
        if (threatNow && nearThreatBefore && nearThreatAfter && this.distance(toTile, nearThreatAfter.coord) < this.distance(actor.coord, nearThreatBefore.coord)) {
          score += this.WEIGHTS.defenderInterceptBonus;
        }
      }
    }

    const castleThreat = context.strategy.castleThreat || { immediateDanger: false, criticalDanger: false, softPressure: false };
    if ((castleThreat.immediateDanger || castleThreat.criticalDanger) && this.distance(toTile, context.myCastle.coord) <= 2) {
      score += this.WEIGHTS.defendCastle;
    } else if (castleThreat.softPressure && role === "defender" && this.distance(toTile, context.myCastle.coord) <= 2) {
      score += Math.trunc(this.WEIGHTS.defendCastle * 0.45);
    } else if (actor.type === "CASTLE" && this.distance(toTile, context.myCastle.coord) <= 1) {
      score += this.WEIGHTS.fallbackCastleScreen;
    }

    if (actor.type === "CASTLE") {
      const castleThreat = context.strategy.castleThreat || { present: false };
      const isEmergency = this.isCastleActionEmergency(gameState, candidate, context);
      const anchorBefore = (fast.distCastleAnchorByTileKey && fast.distCastleAnchorByTileKey[fromKey] !== undefined) ? fast.distCastleAnchorByTileKey[fromKey] : this.distance(actor.coord, context.myCastle.coord);
      const anchorAfter = (fast.distCastleAnchorByTileKey && fast.distCastleAnchorByTileKey[toKey] !== undefined) ? fast.distCastleAnchorByTileKey[toKey] : this.distance(toTile, context.myCastle.coord);
      if (this.distance(toTile, context.myCastle.coord) > 1) {
        score -= this.WEIGHTS.castleAnchorPenalty;
      }
      if (!isEmergency && anchorAfter > anchorBefore) {
        score -= Math.trunc(this.WEIGHTS.castleAnchorPenalty * 0.8);
      }

      const nearestEnemy = this.closestPiece(context.enemyHeroes, toTile);
      if (nearestEnemy && this.distance(toTile, nearestEnemy.coord) >= this.distance(actor.coord, nearestEnemy.coord)) {
        score += this.WEIGHTS.castleGuardSpacing;
      }
      if (castleThreat.present && nearestEnemy && this.distance(toTile, nearestEnemy.coord) <= 1) {
        score += this.WEIGHTS.castleThreatBlockBonus;
      }
      if (castleThreat.present && nearestEnemy && this.distance(toTile, nearestEnemy.coord) > this.distance(actor.coord, nearestEnemy.coord)) {
        score -= Math.trunc(this.WEIGHTS.castleAnchorPenalty * 0.5);
      }
      if (!isEmergency && !this.isCastleDefensiveRetreatMove(gameState, candidate, context)) {
        score -= this.WEIGHTS.castleUnsafeAdvancePenalty;
      }
    }

    return score;
  },

  scoreShrineMove(gameState, myPlayerId, actor, toTile, myHp) {
    if (actor.type !== "CHARACTER") return 0;
    const order = gameState.shrineState && gameState.shrineState.orderShrine;
    const chaos = gameState.shrineState && gameState.shrineState.chaosShrine;
    let score = 0;

    if (order && order.state === "CHARGED" && toTile.x === order.coord.x && toTile.y === order.coord.y) {
      score += myHp <= 2 ? this.WEIGHTS.orderShrineLowHp : this.WEIGHTS.orderShrineNormal;
    }
    if (chaos && chaos.state === "CHARGED" && toTile.x === chaos.coord.x && toTile.y === chaos.coord.y) {
      score += this.WEIGHTS.chaosShrineSetup;
    }
    return score;
  },

  scoreSkillPlacement(gameState, actor, targetTile, context) {
    const heroId = actor.characterId;
    const enemyHeroes = context.enemyHeroes;
    const enemyCastle = context.enemyCastle;
    const nearbyEnemies = enemyHeroes.filter((enemy) => this.distance(enemy.coord, targetTile) <= 1).length;
    const distToCastle = this.distance(targetTile, enemyCastle.coord);
    const distToCenter = this.distance(targetTile, context.strategy.center);
    const shrineAdjacency = context.strategy.chargedShrines.filter((tile) => this.distance(tile, targetTile) <= 1).length;
    const spawnAdjacency = context.strategy.enemySpawnTiles.filter((tile) => this.distance(tile, targetTile) <= 2).length;
    let score = 0;

    score += nearbyEnemies * 100;
    score += Math.max(0, 5 - distToCastle) * this.WEIGHTS.skillLaneBlock;
    score += Math.max(0, 4 - distToCenter) * 30;
    score += shrineAdjacency * this.WEIGHTS.skillShrineControl;
    score += spawnAdjacency * this.WEIGHTS.skillRespawnTrap;

    if (heroId === "mahui") return score + nearbyEnemies * 70 + shrineAdjacency * 40;
    if (heroId === "faros") return score + nearbyEnemies * 60 + Math.max(0, 4 - distToCastle) * 35;
    if (heroId === "sajik") return score + nearbyEnemies * 55 + shrineAdjacency * 25;
    if (heroId === "kidu") return score + Math.max(0, 6 - distToCastle) * 45 + spawnAdjacency * 30;
    if (heroId === "anika") return score + Math.max(0, 4 - distToCenter) * 30 + spawnAdjacency * 18;
    if (heroId === "jumka") return score + nearbyEnemies * 45 + shrineAdjacency * 30;
    return nearbyEnemies * 40;
  },

  // TIP: Adjust this if you want stronger aggression near Chaordic checkpoints.
  chaordicUrgencyScale(gameState, myHp, enemyHp) {
    const roundsLeft = this.getRoundsToNextChaordicCheckpoint(gameState);
    if (roundsLeft === null) return 1;

    const hpDelta = myHp - enemyHp;
    let scale = 1;
    if (roundsLeft <= 2) scale += 0.2;
    if (roundsLeft <= 1) scale += 0.15;
    if (gameState.chaordic && gameState.chaordic.hpTied && hpDelta <= 0) scale += 0.1;
    const stageSize = this.getCurrentStageBoardSizeEquivalent(gameState);
    if (stageSize <= 5) scale += 0.08;
    return scale;
  },

  distance(aTile, bTile) {
    return Math.max(Math.abs(aTile.x - bTile.x), Math.abs(aTile.y - bTile.y));
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

  // Deterministic BFS utilities kept for easy extension.
  // TIP: Extend this for route safety scoring (trap/adjacency penalties).
  bfsPath(gameState, startTile, goalTiles, allowGoalBlocked) {
    if (!startTile || !goalTiles || goalTiles.length === 0) return [];
    const bounds = this.getActiveBounds(gameState);
    const goals = goalTiles.slice().sort(this.compareTiles);
    const goalSet = new Set(goals.map((tile) => `${tile.x},${tile.y}`));
    const queue = [startTile];
    const startKey = `${startTile.x},${startTile.y}`;
    const visited = new Set([startKey]);
    const parentByKey = { [startKey]: null };

    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      const currentKey = `${current.x},${current.y}`;
      if (goalSet.has(currentKey) && currentKey !== startKey) {
        return this.rebuildPath(parentByKey, startKey, currentKey);
      }

      for (const direction of this.directionVectors()) {
        const next = { x: current.x + direction.x, y: current.y + direction.y };
        const nextKey = `${next.x},${next.y}`;
        if (visited.has(nextKey)) continue;
        if (this.isVoidTile(gameState, next, bounds)) continue;
        const blocked = this.isTileBlocked(gameState, next);
        const isGoal = goalSet.has(nextKey);
        if (blocked && !(allowGoalBlocked && isGoal)) continue;
        visited.add(nextKey);
        parentByKey[nextKey] = currentKey;
        queue.push(next);
      }
    }

    return [];
  },

  getPathToEnemyCastle(gameState, heroTile, enemyCastleTile) {
    const goals = [];
    for (const direction of this.directionVectors()) {
      goals.push({ x: enemyCastleTile.x + direction.x, y: enemyCastleTile.y + direction.y });
    }
    return this.bfsPath(gameState, heroTile, goals, true);
  },

  getPathToNearestEnemyHero(gameState, heroTile, enemyHeroes) {
    const orderedEnemies = enemyHeroes.slice().sort((a, b) => a.id.localeCompare(b.id));
    let bestPath = [];
    for (const enemy of orderedEnemies) {
      const path = this.bfsPath(gameState, heroTile, [enemy.coord], true);
      if (path.length === 0) continue;
      if (bestPath.length === 0 || path.length < bestPath.length) {
        bestPath = path;
      }
    }
    return bestPath;
  },

  selectHeroByRole(heroes, role, excludedId) {
    const pool = heroes.filter((hero) => hero.id !== excludedId);
    if (pool.length === 0) return null;
    const sorted = pool.slice().sort((left, right) => {
      const diff = this.heroRolePriority(right.characterId, role) - this.heroRolePriority(left.characterId, role);
      if (diff !== 0) return diff;
      return left.id.localeCompare(right.id);
    });
    return sorted[0];
  },

  heroRolePriority(characterId, role) {
    const pressure = {
      kidu: 95,
      faros: 90,
      sajik: 80,
      jumka: 72,
      mahui: 64,
      anika: 58,
    };
    const shrine = {
      sajik: 96,
      faros: 90,
      jumka: 88,
      mahui: 82,
      anika: 76,
      kidu: 60,
    };
    const control = {
      mahui: 98,
      jumka: 92,
      sajik: 88,
      anika: 84,
      faros: 76,
      kidu: 66,
    };
    const defender = {
      mahui: 99,
      sajik: 94,
      jumka: 90,
      faros: 82,
      anika: 75,
      kidu: 62,
    };
    const table = role === "pressure" ? pressure : (role === "shrine" ? shrine : (role === "defender" ? defender : control));
    return table[characterId] || 0;
  },

  roleForHero(hero, strategy) {
    if (!hero || hero.type !== "CHARACTER") return "castle";
    if (hero.id === strategy.pressureHeroId) return "pressure";
    if (hero.id === strategy.shrineRunnerId) return "shrine";
    if (hero.id === strategy.defenderHeroId) return "defender";
    if (hero.id === strategy.controlHeroId) return "control";
    if (this.heroRolePriority(hero.characterId, "defender") >= this.heroRolePriority(hero.characterId, "pressure")) return "defender";
    if (this.heroRolePriority(hero.characterId, "shrine") >= this.heroRolePriority(hero.characterId, "pressure")) return "shrine";
    return this.heroRolePriority(hero.characterId, "pressure") >= this.heroRolePriority(hero.characterId, "control") ? "pressure" : "control";
  },

  estimateMyTurnIndex(gameState, myPlayerId) {
    const turnNumber = typeof gameState.turnNumber === "number" ? gameState.turnNumber : 1;
    if (myPlayerId === "P1") return Math.max(1, Math.ceil(turnNumber / 2));
    return Math.max(1, Math.floor(turnNumber / 2));
  },

  boardCenter(gameState) {
    const bounds = this.getActiveBounds(gameState);
    return {
      x: Math.floor((bounds.minX + bounds.maxX) / 2),
      y: Math.floor((bounds.minY + bounds.maxY) / 2),
    };
  },

  getChargedShrines(gameState) {
    const shrineState = gameState.shrineState || {};
    const tiles = [];
    const order = shrineState.orderShrine;
    const chaos = shrineState.chaosShrine;
    if (order && order.state === "CHARGED" && order.coord) tiles.push(order.coord);
    if (chaos && chaos.state === "CHARGED" && chaos.coord) tiles.push(chaos.coord);
    return tiles.sort(this.compareTiles);
  },

  getSpawnTile(piece) {
    return piece.spawnCoord || piece.respawnCoord || piece.startCoord || piece.homeCoord || null;
  },

  actorHasChaosBlessing(actor) {
    const blessing = actor && actor.blessing ? String(actor.blessing).toLowerCase() : "";
    const blessings = Array.isArray(actor && actor.blessings) ? actor.blessings.map((entry) => String(entry).toLowerCase()) : [];
    return blessing === "chaos" || blessings.includes("chaos");
  },

  hasAnyBlessing(actor) {
    return Boolean((actor && actor.blessing) || (Array.isArray(actor && actor.blessings) && actor.blessings.length > 0));
  },

  isPieceOnChargedShrine(piece, gameState) {
    if (!piece || !piece.coord) return false;
    return this.getChargedShrines(gameState).some((tile) => this.isSameTile(tile, piece.coord));
  },

  countAdjacentAllies(tile, pieces, excludedId) {
    return pieces.filter((piece) => piece.id !== excludedId && this.isAdjacent(tile, piece.coord)).length;
  },

  countAdjacentEnemiesToTile(tile, enemyPieces, excludedId) {
    return enemyPieces.filter((piece) => piece.id !== excludedId && this.isAdjacent(tile, piece.coord)).length;
  },

  countBlockedNeighbors(gameState, tile, bounds) {
    let blocked = 0;
    const active = bounds || this.getActiveBounds(gameState);
    for (const dir of this.directionVectors()) {
      const next = { x: tile.x + dir.x, y: tile.y + dir.y };
      if (this.isVoidTile(gameState, next, active) || this.isTileBlocked(gameState, next)) {
        blocked += 1;
      }
    }
    return blocked;
  },

  closestTile(fromTile, tiles) {
    if (!fromTile || !tiles || tiles.length === 0) return null;
    const ordered = tiles.slice().sort(this.compareTiles);
    let best = null;
    let bestDistance = Infinity;
    for (const tile of ordered) {
      const dist = this.distance(fromTile, tile);
      if (dist < bestDistance) {
        best = tile;
        bestDistance = dist;
      }
    }
    return best;
  },

  closestDistance(fromTile, tiles) {
    const nearest = this.closestTile(fromTile, tiles);
    if (!nearest) return null;
    return this.distance(fromTile, nearest);
  },

  closestPiece(pieces, tile) {
    if (!pieces || pieces.length === 0) return null;
    const ordered = pieces.slice().sort((a, b) => a.id.localeCompare(b.id));
    let best = null;
    let bestDistance = Infinity;
    for (const piece of ordered) {
      const dist = this.distance(piece.coord, tile);
      if (dist < bestDistance) {
        best = piece;
        bestDistance = dist;
      }
    }
    return best;
  },

  isSameTile(left, right) {
    return Boolean(left && right && left.x === right.x && left.y === right.y);
  },

  rebuildPath(parentByKey, startKey, endKey) {
    const path = [];
    let cursor = endKey;
    while (cursor && cursor !== startKey) {
      const parts = cursor.split(",");
      path.push({ x: Number(parts[0]), y: Number(parts[1]) });
      cursor = parentByKey[cursor];
    }
    path.reverse();
    return path;
  },

  directionVectors() {
    // Deterministic tie-break order: N, NE, E, SE, S, SW, W, NW
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
};
