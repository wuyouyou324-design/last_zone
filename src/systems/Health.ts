import { EquippedState, HealingState, InventoryItem } from '../types/game';

export class HealthSystem {
  public health = 100;
  public readonly maxHealth = 100;
  public stamina = 100;
  public readonly maxStamina = 100;
  public eliminated = false;

  private activeHeal: {
    item: InventoryItem;
    elapsed: number;
    total: number;
  } | null = null;

  public reset(): void {
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.eliminated = false;
    this.activeHeal = null;
  }

  public updateStamina(dt: number, isSprinting: boolean, isMoving: boolean): void {
    if (isSprinting && isMoving) {
      this.stamina = Math.max(0, this.stamina - 18 * dt);
    } else {
      const regenRate = isMoving ? 10 : 18;
      this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * dt);
    }
  }

  public canSprint(): boolean {
    return this.stamina > 6;
  }

  public consumeJumpStamina(): boolean {
    if (this.stamina < 10) return false;
    this.stamina = Math.max(0, this.stamina - 10);
    return true;
  }

  public applyDamage(
    rawAmount: number,
    isHeadshot: boolean,
    equipped: EquippedState,
    ignoreArmor = false,
  ): number {
    if (this.eliminated) return 0;
    let finalDamage = rawAmount;

    if (!ignoreArmor) {
      if (isHeadshot && equipped.helmetDurability > 0) {
        const absorbed = Math.min(equipped.helmetDurability, rawAmount * 0.45);
        equipped.helmetDurability = Math.max(0, equipped.helmetDurability - absorbed * 1.1);
        finalDamage = Math.max(2, rawAmount - absorbed);
      } else if (!isHeadshot && equipped.vestDurability > 0) {
        const absorbed = Math.min(equipped.vestDurability, rawAmount * 0.4);
        equipped.vestDurability = Math.max(0, equipped.vestDurability - absorbed * 1.1);
        finalDamage = Math.max(2, rawAmount - absorbed);
      }
    }

    this.health = Math.max(0, this.health - finalDamage);
    if (this.health <= 0) {
      this.eliminated = true;
      this.activeHeal = null;
    }
    return finalDamage;
  }

  public startHealing(item: InventoryItem): boolean {
    if (this.eliminated || this.health >= this.maxHealth) return false;
    if (this.activeHeal) return false;
    const duration = item.useTime ?? 2.5;
    this.activeHeal = {
      item,
      elapsed: 0,
      total: duration,
    };
    return true;
  }

  public cancelHealing(): void {
    this.activeHeal = null;
  }

  public isHealing(): boolean {
    return this.activeHeal !== null;
  }

  public updateHealing(dt: number): InventoryItem | null {
    if (!this.activeHeal) return null;
    this.activeHeal.elapsed += dt;
    if (this.activeHeal.elapsed >= this.activeHeal.total) {
      const completed = this.activeHeal.item;
      const healAmount = completed.healAmount ?? 25;
      this.health = Math.min(this.maxHealth, this.health + healAmount);
      this.activeHeal = null;
      return completed;
    }
    return null;
  }

  public getHealingState(): HealingState | null {
    if (!this.activeHeal) return null;
    return {
      itemName: this.activeHeal.item.name,
      progress: Math.min(1, this.activeHeal.elapsed / this.activeHeal.total),
      remainingSec: Math.max(0, this.activeHeal.total - this.activeHeal.elapsed),
    };
  }
}
