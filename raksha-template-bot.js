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
 *
 * TIP FOR HUMANS + LLMs
 * - Score legal actions from `gameState.legalByPieceId`; avoid inventing actions.
 * - Do not assume unit HP. Use player HP (`gameState.playerHp`) for risk/finish logic.
 * - Use `activeBounds` / `chaordic` to avoid void tiles and plan checkpoint urgency.
 * - If a hero is channeling shrine, avoid moving it away unless a forced win is available.
 */
const bot = {
  botName: "RakshaTemplateBot",
  botAuthor: "Community Starter",
  botLore: "A deterministic baseline tactician for shrine pressure, altar lanes, and safe duels.",
  version: "2.0.0",
  lastUpdated: "2026-03-05",

  WEIGHTS: {
    altarWinNow: 100000,
    altarPressure: 260,
    heroAttack: 1400,
    hpFinishPressure: 650,
    orderShrineLowHp: 500,
    orderShrineNormal: 170,
    chaosShrineSetup: 360,
    skillPlacement: 190,
    defendAltar: 880,
    avoidThreatWhenLowHp: 260,
    channelKeepBonus: 520,
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
    const myAltar = this.getMyAltar(gameState, myPlayerId);
    const enemyAltar = this.getEnemyAltar(gameState, myPlayerId);
    if (!myAltar || !enemyAltar) {
      return this.endTurnFallback(gameState, myPlayerId, rng);
    }

    const legalActions = this.collectLegalActions(gameState, myPlayerId);
    if (legalActions.length === 0) {
      return null;
    }

    // Hard rule: always take immediate altar win.
    const altarWin = legalActions.find((candidate) =>
      candidate.action.type === "ATTACK" && candidate.targetPiece && candidate.targetPiece.type === "ALTAR",
    );
    if (altarWin) {
      return altarWin.action;
    }

    const myHeroes = this.getMyHeroes(gameState, myPlayerId);
    const enemyHeroes = this.getEnemyHeroes(gameState, myPlayerId);
    const myHp = (gameState.playerHp && gameState.playerHp[myPlayerId]) || 6;
    const enemyId = myPlayerId === "P1" ? "P2" : "P1";
    const enemyHp = (gameState.playerHp && gameState.playerHp[enemyId]) || 6;

    // If already channeling, avoid moving that hero off shrine unless we can instantly win.
    const channelingHeroIds = this.getChannelingHeroIds(gameState, myHeroes);
    if (channelingHeroIds.size > 0) {
      const keepCandidates = legalActions.filter((candidate) => {
        if (!channelingHeroIds.has(candidate.actor.id)) return true;
        return candidate.action.type !== "MOVE";
      });
      const scoredKeep = this.evaluateActions(gameState, myPlayerId, keepCandidates, {
        myAltar,
        enemyAltar,
        myHeroes,
        enemyHeroes,
        myHp,
        enemyHp,
        preferKeepChannel: true,
      });
      if (scoredKeep.length > 0) {
        return this.tieBreak(scoredKeep, rng);
      }
    }

    const scored = this.evaluateActions(gameState, myPlayerId, legalActions, {
      myAltar,
      enemyAltar,
      myHeroes,
      enemyHeroes,
      myHp,
      enemyHp,
      preferKeepChannel: false,
    });

    if (scored.length > 0) {
      return this.tieBreak(scored, rng);
    }

    return this.endTurnFallback(gameState, myPlayerId, rng);
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
        if (candidate.targetPiece && candidate.targetPiece.type === "ALTAR") {
          score += this.WEIGHTS.altarWinNow;
        } else {
          score += this.WEIGHTS.heroAttack;
          if (context.enemyHp <= 1) score += this.WEIGHTS.hpFinishPressure;
        }
      }

      if (action.type === "MOVE") {
        const distBefore = this.distance(actor.coord, context.enemyAltar.coord);
        const distAfter = this.distance(action.toTile, context.enemyAltar.coord);
        score += Math.max(0, distBefore - distAfter) * this.WEIGHTS.altarPressure;

        if (this.isAltarThreatened(gameState, context.myAltar, context.enemyHeroes)) {
          if (this.distance(action.toTile, context.myAltar.coord) <= 2) {
            score += this.WEIGHTS.defendAltar;
          }
        }

        const shrineBonus = this.scoreShrineMove(gameState, myPlayerId, actor, action.toTile, context.myHp);
        score += shrineBonus;
      }

      if (action.type === "SKILL") {
        // TIP: Increase this if you want trap-heavy gameplay near enemy lanes.
        score += this.WEIGHTS.skillPlacement;
        score += this.scoreSkillPlacement(gameState, actor, action.targetTile, context.enemyAltar, context.enemyHeroes);
      }

      // TIP: Risk tolerance can be tuned by HP; low HP should avoid random melee unless winning.
      if (targetTile && context.myHp <= 2 && this.isThreatenedByEnemy(targetTile, context.enemyHeroes)) {
        score -= this.WEIGHTS.avoidThreatWhenLowHp;
      }

      if (context.preferKeepChannel && actor.shrineChannel && action.type !== "MOVE") {
        score += this.WEIGHTS.channelKeepBonus;
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
      const legal = gameState.legalByPieceId[piece.id] || { moves: [], attacks: [], skills: [] };
      const moves = (legal.moves || []).slice().sort(this.compareTiles);
      const attacks = (legal.attacks || []).slice().sort();
      const skills = (legal.skills || []).slice().sort(this.compareTiles);

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

  isAltarThreatened(gameState, myAltar, enemyHeroes) {
    return enemyHeroes.some((enemy) => this.distance(enemy.coord, myAltar.coord) <= 2);
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

  scoreSkillPlacement(gameState, actor, targetTile, enemyAltar, enemyHeroes) {
    const heroId = actor.characterId;
    const nearbyEnemies = enemyHeroes.filter((enemy) => this.distance(enemy.coord, targetTile) <= 1).length;
    const distToAltar = this.distance(targetTile, enemyAltar.coord);

    // TIP: Improve chooseSkillPlacement() here to create two-turn forced adjacency traps.
    if (heroId === "mahui") return nearbyEnemies * 140 + Math.max(0, 4 - distToAltar) * 30;
    if (heroId === "faros") return nearbyEnemies * 130 + Math.max(0, 5 - distToAltar) * 26;
    if (heroId === "sajik") return nearbyEnemies * 120 + Math.max(0, 5 - distToAltar) * 24;
    if (heroId === "kidu") return Math.max(0, 6 - distToAltar) * 42;
    if (heroId === "anika") return nearbyEnemies * 95 + Math.max(0, 5 - distToAltar) * 20;
    if (heroId === "jumka") return nearbyEnemies * 100 + Math.max(0, 5 - distToAltar) * 16;
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

    while (queue.length > 0) {
      const current = queue.shift();
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
      queue.sort(this.compareTiles);
    }

    return [];
  },

  getPathToEnemyAltar(gameState, heroTile, enemyAltarTile) {
    const goals = [];
    for (const direction of this.directionVectors()) {
      goals.push({ x: enemyAltarTile.x + direction.x, y: enemyAltarTile.y + direction.y });
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
