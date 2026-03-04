import Phaser from "phaser";

class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private blocks: Phaser.GameObjects.Rectangle[] = [];

  private trail: Phaser.GameObjects.Rectangle[] = [];

  private score = 0;
  private best = 0;

  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  private spawnTimer = 0;
  private spawnDelay = 800;

  private alive = true;
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

  // Addictive loop knobs
  private nearMissStreak = 0;
  private lastNearMissAt = 0;

  constructor() {
    super("main");
  }

  create() {
    // RESET STATE (needed for scene.restart())
    this.alive = true;
    this.score = 0;
    this.spawnTimer = 0;
    this.spawnDelay = 800;
    this.nearMissStreak = 0;
    this.lastNearMissAt = 0;

    // Clean up any leftover blocks
    for (const b of this.blocks) b.destroy();
    this.blocks = [];

    // Clean up old keyboard listeners so they don't stack
    this.input.keyboard?.removeAllListeners();
    const w = this.scale.width;
    const h = this.scale.height;

    this.cameras.main.setBackgroundColor("#0f1226");

    // Load best score
    this.best = Number(localStorage.getItem("neon_best") || "0");

    // Player
    this.player = this.add.rectangle(w / 2, h - 50, 80, 18, 0x39e7ff);
    this.player.setStrokeStyle(2, 0xffffff, 0.2);

    // Controls
    this.cursors = this.input.keyboard!.createCursorKeys();

    // UI
    this.scoreText = this.add.text(15, 12, "Score: 0", {
      fontFamily: "system-ui, Segoe UI, Arial",
      fontSize: "18px",
      color: "#ffffff",
    });

    this.bestText = this.add.text(15, 34, `Best: ${this.best}`, {
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

    // Restart
    this.input.keyboard?.on("keydown-R", () => {
      this.scene.restart();
    });
  }

  update(_: number, delta: number) {
    if (!this.alive) return;

    const w = this.scale.width;

    // Movement
    if (this.cursors.left.isDown) this.player.x -= 6;
    if (this.cursors.right.isDown) this.player.x += 6;

    this.player.x = Phaser.Math.Clamp(this.player.x, 40, w - 40);
// TRAIL PIECE
const t = this.add.rectangle(
  this.player.x,
  this.player.y,
  this.player.width,
  this.player.height,
  0x39e7ff
);

t.setAlpha(0.25);
this.trail.push(t);

// Fade old trail pieces
for (let i = this.trail.length - 1; i >= 0; i--) {
  const piece = this.trail[i];

  piece.alpha -= 0.03;

  if (piece.alpha <= 0) {
    piece.destroy();
    this.trail.splice(i, 1);
  }
}
    // Spawn blocks
    this.spawnTimer += delta;

    if (this.spawnTimer > this.spawnDelay) {
      this.spawnTimer = 0;

      const x = Phaser.Math.Between(20, w - 20);
      const size = Phaser.Math.Between(18, 40);

      const block = this.add.rectangle(x, -20, size, size, 0xff4d6d);
      block.setStrokeStyle(2, 0xffffff, 0.15);
      this.blocks.push(block);

      // Base score: survive spawns
      this.addScore(1);

      // Ramp difficulty
      if (this.spawnDelay > 250) this.spawnDelay -= 6;
    }

    // Update blocks
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      b.y += 4;

      // Collision
      const hit =
        Math.abs(b.x - this.player.x) <
          (b.width / 2 + this.player.width / 2) &&
        Math.abs(b.y - this.player.y) <
          (b.height / 2 + this.player.height / 2);

      if (hit) {
        this.hitFX();
        this.gameOver();
        return;
      }

      // Near miss bonus: close pass without collision
      const near =
        Math.abs(b.y - this.player.y) < 18 &&
        Math.abs(b.x - this.player.x) <
          (b.width / 2 + this.player.width / 2) + 10;

      if (near) {
        const now = this.time.now;

        // Prevent repeatedly scoring on the same moment
        if (now - this.lastNearMissAt > 120) {
          this.lastNearMissAt = now;
          this.nearMissStreak += 1;

          const bonus = Math.min(8, 1 + Math.floor(this.nearMissStreak / 2));
          this.addScore(bonus);

          this.comboText.setAlpha(1);
          this.comboText.setText(`NEAR MISS x${this.nearMissStreak} (+${bonus})`);

          // Quick pop animation
          this.tweens.add({
            targets: this.comboText,
            scale: { from: 1.05, to: 1 },
            duration: 140,
            yoyo: true,
          });

          // Fade out after a moment
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

    // Streak decay (keeps pressure on)
    if (this.nearMissStreak > 0 && this.time.now - this.lastNearMissAt > 1200) {
      this.nearMissStreak = 0;
    }
  }

  private addScore(amount: number) {
    this.score += amount;
    this.scoreText.setText(`Score: ${this.score}`);

    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem("neon_best", String(this.best));
      this.bestText.setText(`Best: ${this.best}`);
    }
  }

  private hitFX() {
    this.cameras.main.shake(140, 0.01);
    this.cameras.main.flash(120, 255, 77, 109);
  }

  private gameOver() {
  this.alive = false;

  const w = this.scale.width;
  const h = this.scale.height;

  const taunt = this.taunts[Math.floor(Math.random() * this.taunts.length)];

  // Taunt text
  const tauntText = this.add.text(w / 2, h / 2 - 60, taunt, {
    fontSize: "22px",
    color: "#ff4d6d",
    align: "center",
    wordWrap: { width: w - 80 }
  }).setOrigin(0.5);

  // Flash effect
  this.tweens.add({
    targets: tauntText,
    alpha: { from: 1, to: 0.2 },
    duration: 120,
    yoyo: true,
    repeat: -1
  });

  // Error line
  this.add.text(w / 2, h / 2, "ERROR // SKILL_CHECK_FAILED", {
    fontSize: "16px",
    color: "#ffffff"
  }).setOrigin(0.5);

  // Score
  this.add.text(
    w / 2,
    h / 2 + 40,
    `Final: ${this.score}   Best: ${this.best}`,
    {
      fontSize: "14px",
      color: "#cbd5e1"
    }
  ).setOrigin(0.5);

  // TRY AGAIN BUTTON
  const button = this.add.rectangle(w / 2, h / 2 + 100, 160, 40, 0x39e7ff)
    .setInteractive({ useHandCursor: true });

  const buttonText = this.add.text(w / 2, h / 2 + 100, "TRY AGAIN", {
    fontSize: "16px",
    color: "#000000"
  }).setOrigin(0.5);

  // Hover effect
  button.on("pointerover", () => {
    button.setFillStyle(0x5ff0ff);
  });

  button.on("pointerout", () => {
    button.setFillStyle(0x39e7ff);
  });

  // Restart game
  button.on("pointerdown", () => {
    this.scene.restart();
  });
  }
}
new Phaser.Game({
  type: Phaser.AUTO,
  width: 500,
  height: 500,
  parent: "app",
  scene: MainScene,
});
