import Phaser from "phaser";

type Block = { rect: Phaser.GameObjects.Rectangle; dodged: boolean };

class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private blocks: Block[] = [];
  private trail: Phaser.GameObjects.Rectangle[] = [];

  private score = 0;
  private best = 0;

  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  private spawnTimer = 0;
  private spawnDelay = 800;

  private alive = true;
  private dodgeCount = 0;

  private nearMissStreak = 0;
  private lastNearMissAt = 0;
  private tension = 0;
  private aimStrength = 0.25;

  private bgMusic?: Phaser.Sound.BaseSound;
  private bgStarted = false;

   private taunts = [
    "LMAO. You actually suck. Need me to slow it down, pussy?",
    "You lasted like 0.2 seconds. Probably shorter in bed.",
    "You peaked in high school",
    "That was tragic. I bet your mom hates you.",
    "0/10, your dad should have pulled out",
    "I’ve seen better movement from a screensaver.",
    "Try using your hands next time, we know you're used to it.",
    "You’re not useless. You’re a warning",
    "Not you getting cooked by squares, pussy.",
    "You peaked in high school",
  ];

  constructor() {
    super("main");
  }

  preload() {
    this.load.audio(
      "win",
      new URL("./assets/sounds/winning.wav", import.meta.url).toString()
    );

    this.load.audio(
      "lose",
      new URL("./assets/sounds/lose.wav", import.meta.url).toString()
    );

    this.load.audio(
      "bg",
      new URL("./assets/sounds/background.wav", import.meta.url).toString()
    );
  }

  create() {
    // Reset state (scene.restart safe)
    this.alive = true;
    this.score = 0;
    this.spawnTimer = 0;
    this.spawnDelay = 800;
    this.nearMissStreak = 0;
    this.lastNearMissAt = 0;
    this.tension = 0;
    this.dodgeCount = 0;

    // Clean up objects
    for (const item of this.blocks) item.rect.destroy();
    this.blocks = [];
    for (const t of this.trail) t.destroy();
    this.trail = [];

    // Remove old listeners (prevents stacking after restart)
    this.input.keyboard?.removeAllListeners();
    this.input.removeAllListeners();

    const w = this.scale.width;
    const h = this.scale.height;

    this.cameras.main.setBackgroundColor("#0f1226");

    // Best score
    this.best = Number(localStorage.getItem("neon_best") || "0");

    // Player
    this.player = this.add.rectangle(w / 2, h - 50, 80, 18, 0x39e7ff);
    this.player.setStrokeStyle(2, 0xffffff, 0.2);

    // Controls
    this.cursors = this.input.keyboard!.createCursorKeys();

    // UI
    this.scoreText = this.add.text(15, 12, "$0", {
      fontFamily: "system-ui, Segoe UI, Arial",
      fontSize: "18px",
      color: "#ffffff",
    });

    this.bestText = this.add.text(15, 34, `Best: $${this.best.toLocaleString()}`, {
      fontFamily: "system-ui, Segoe UI, Arial",
      fontSize: "14px",
      color: "#cbd5e1",
    });

    this.comboText = this.add
      .text(w - 15, 18, "", {
        fontFamily: "system-ui, Segoe UI, Arial",
        fontSize: "14px",
        color: "#fbbf24",
      })
      .setOrigin(1, 0);

    this.add.text(15, h - 26, "Move: ←/→   Restart: R", {
      fontFamily: "system-ui, Segoe UI, Arial",
      fontSize: "12px",
      color: "#94a3b8",
    });

    // Start bg music on first user gesture (avoids Chrome autoplay block)
    const startBgOnce = () => {
      if (this.bgStarted) return;
      this.bgStarted = true;

      this.bgMusic = this.sound.add("bg", { volume: 0.35, loop: true });
      this.bgMusic.play();
    };

    this.input.once("pointerdown", startBgOnce);
    this.input.keyboard?.once("keydown", startBgOnce);

    // Restart (works from game over too)
    this.input.keyboard?.on("keydown-R", () => {
      this.scene.restart();
    });

    // Safety: stop music when scene is shut down
    this.events.once("shutdown", () => {
      if (this.bgMusic && this.bgMusic.isPlaying) this.bgMusic.stop();
    });
  }

  update(_: number, delta: number) {
    if (!this.alive) return;

    const w = this.scale.width;

    // Movement
    if (this.cursors.left.isDown) this.player.x -= 6;
    if (this.cursors.right.isDown) this.player.x += 6;

    this.player.x = Phaser.Math.Clamp(this.player.x, 40, w - 40);

    // Trail
    const t = this.add.rectangle(
      this.player.x,
      this.player.y,
      this.player.width,
      this.player.height,
      0x39e7ff
    );
    t.setAlpha(0.22);
    this.trail.push(t);

    for (let i = this.trail.length - 1; i >= 0; i--) {
      const piece = this.trail[i];
      piece.alpha -= 0.035;
      if (piece.alpha <= 0) {
        piece.destroy();
        this.trail.splice(i, 1);
      }
    }

    // Spawn blocks
    this.spawnTimer += delta;

    if (this.spawnTimer > this.spawnDelay) {
      this.spawnTimer = 0;

      const padding = 24;
      const randomX = Phaser.Math.Between(padding, w - padding);

      const baseAim = this.aimStrength + this.score * 0.0015;
      const tensionRelief = this.tension * 0.02;
      const strength = Phaser.Math.Clamp(baseAim - tensionRelief, 0.2, 0.72);

      const aimedX = Phaser.Math.Linear(randomX, this.player.x, strength);
      const jitter = Phaser.Math.Between(-40, 40);
      const x = Phaser.Math.Clamp(aimedX + jitter, padding, w - padding);

      let size = Phaser.Math.Between(18, 40);
      if (strength > 0.6) size = Phaser.Math.Clamp(size - 6, 18, 40);

      const block = this.add.rectangle(x, -20, size, size, 0xff4d6d);
      block.setStrokeStyle(2, 0xffffff, 0.15);

      this.blocks.push({ rect: block, dodged: false });

      // Score ticks up with time survived
      this.addScore(1);

      // Ramp difficulty
      if (this.spawnDelay > 250) this.spawnDelay -= 6;
    }

    // Update blocks
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const item = this.blocks[i];
      const b = item.rect;

      b.y += 4;

      // Collision
      const hit =
        Math.abs(b.x - this.player.x) <
          b.width / 2 + this.player.width / 2 &&
        Math.abs(b.y - this.player.y) <
          b.height / 2 + this.player.height / 2;

      if (hit) {
        this.hitFX();
        this.sound.play("lose", { volume: 0.6 });
        this.gameOver();
        return;
      }

      // Dodged (passed player)
      const passedPlayer =
        b.y > this.player.y + this.player.height / 2 + b.height / 2 + 2;

      if (passedPlayer && !item.dodged) {
        item.dodged = true;

        this.cashPop();
        this.dodgeCount++;

        if (this.dodgeCount % 5 === 0) {
          this.sound.play("win", {
            volume: 0.5,
            rate: Phaser.Math.Clamp(1 + this.score * 0.01, 1, 1.6),
          });
        }
      }

      // Near miss bonus
      const near =
        Math.abs(b.y - this.player.y) < 18 &&
        Math.abs(b.x - this.player.x) <
          b.width / 2 + this.player.width / 2 + 10;

      if (near) {
        const now = this.time.now;
        if (now - this.lastNearMissAt > 120) {
          this.lastNearMissAt = now;
          this.nearMissStreak += 1;

          this.tension += 2;
          this.tension = Phaser.Math.Clamp(this.tension, 0, 20);

          const bonus = Math.min(8, 1 + Math.floor(this.nearMissStreak / 2));
          this.addScore(bonus);

          this.comboText.setAlpha(1);
          this.comboText.setText(`NEAR MISS x${this.nearMissStreak} (+${bonus})`);

          this.tweens.add({
            targets: this.comboText,
            scale: { from: 1.05, to: 1 },
            duration: 140,
            yoyo: true,
          });

          this.tweens.add({
            targets: this.comboText,
            alpha: { from: 1, to: 0 },
            duration: 520,
            delay: 220,
            onComplete: () => {
              this.comboText.setText("");
              this.comboText.setAlpha(1);
            },
          });
        }
      }

      // Cleanup
      if (b.y > 520) {
        b.destroy();
        this.blocks.splice(i, 1);
      }
    }

    // Streak decay
    if (this.nearMissStreak > 0 && this.time.now - this.lastNearMissAt > 1200) {
      this.nearMissStreak = 0;
    }

    // Tension decay
    this.tension -= 0.01 * delta;
    this.tension = Phaser.Math.Clamp(this.tension, 0, 20);

    if (this.tension > 15) {
      this.cameras.main.flash(35, 255, 50, 50);
    }
  }

  private cashPop() {
    const w = this.scale.width;
    const x = w - 14;
    const y = 42;

    const txt = this.add
      .text(x, y, "$$$", {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: "18px",
        color: "#22c55e",
      })
      .setOrigin(1, 0)
      .setDepth(50);

    this.tweens.add({
      targets: txt,
      alpha: { from: 1, to: 0 },
      y: { from: y, to: y - 18 },
      duration: 320,
      ease: "Quad.out",
      onComplete: () => txt.destroy(),
    });

    this.tweens.add({
      targets: txt,
      scale: { from: 1.25, to: 1 },
      duration: 110,
      ease: "Quad.out",
    });
  }

  private addScore(amount: number) {
    this.score += amount;

    this.scoreText.setText(`$${this.score.toLocaleString()}`);

    this.tweens.add({
      targets: this.scoreText,
      scale: { from: 1.12, to: 1 },
      duration: 110,
      ease: "Quad.out",
    });

    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem("neon_best", String(this.best));
      this.bestText.setText(`Best: $${this.best.toLocaleString()}`);
    }
  }

  private hitFX() {
    this.cameras.main.shake(140, 0.01);
    this.cameras.main.flash(120, 255, 77, 109);
  }

  private gameOver() {
    this.alive = false;

    // Stop bg music immediately
    if (this.bgMusic && this.bgMusic.isPlaying) this.bgMusic.stop();

    // Kill leftover combo text tween spam
    this.tweens.killTweensOf(this.comboText);

    const w = this.scale.width;
    const h = this.scale.height;

    // Dark overlay
    this.add
      .rectangle(w / 2, h / 2, w, h, 0x000000, 0.65)
      .setDepth(999);

    const taunt = this.taunts[Math.floor(Math.random() * this.taunts.length)];

    const tauntText = this.add
      .text(w / 2, h / 2 - 70, taunt, {
        fontFamily: "system-ui, Segoe UI, Arial",
        fontSize: "26px",
        color: "#ff4d6d",
        align: "center",
        wordWrap: { width: w - 80 },
      })
      .setOrigin(0.5)
      .setDepth(1000);

    // Flash taunt
    this.tweens.add({
      targets: tauntText,
      alpha: { from: 1, to: 0.2 },
      duration: 120,
      yoyo: true,
      repeat: -1,
    });

    this.add
      .text(w / 2, h / 2 - 10, "ERROR // SKILL_CHECK_FAILED", {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setDepth(1000);

    this.add
      .text(
        w / 2,
        h / 2 + 28,
        `Final: $${this.score.toLocaleString()}   Best: $${this.best.toLocaleString()}`,
        {
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          fontSize: "14px",
          color: "#cbd5e1",
        }
      )
      .setOrigin(0.5)
      .setDepth(1000);

    // Try Again button
    const button = this.add
      .rectangle(w / 2, h / 2 + 90, 180, 44, 0x39e7ff)
      .setInteractive({ useHandCursor: true })
      .setDepth(1000);

    const buttonText = this.add
      .text(w / 2, h / 2 + 90, "TRY AGAIN", {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: "16px",
        color: "#071018",
      })
      .setOrigin(0.5)
      .setDepth(1001);

    button.on("pointerover", () => button.setFillStyle(0x5ff0ff));
    button.on("pointerout", () => button.setFillStyle(0x39e7ff));

    button.on("pointerdown", () => {
      this.scene.restart();
    });

    // Optional: allow click anywhere to restart too
    this.input.once("pointerdown", () => this.scene.restart());
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 500,
  height: 500,
  parent: "app",
  scene: MainScene,
});