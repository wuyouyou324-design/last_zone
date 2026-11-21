import * as THREE from 'three';
import type { CharacterAnimState, CharacterMotionState } from './CharacterTypes';

export class CharacterAnimator {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<CharacterAnimState, THREE.AnimationAction>();
  private currentState: CharacterAnimState = 'Idle';
  private overlayTimer = 0;
  private overlayDuration = 0;
  private eliminatedLocked = false;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);

    const names: CharacterAnimState[] = [
      'Idle',
      'Walk',
      'Run',
      'Crouch',
      'Aim',
      'Reload',
      'Jump',
      'HitReaction',
      'Elimination',
    ];

    for (const name of names) {
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      if (name === 'Reload' || name === 'HitReaction' || name === 'Elimination' || name === 'Jump') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      this.actions.set(name, action);
    }

    const idle = this.actions.get('Idle');
    if (idle) {
      idle.play();
      this.currentState = 'Idle';
    }
  }

  public triggerHitReaction(): void {
    if (this.eliminatedLocked) return;
    this.transitionTo('HitReaction', 0.06);
    this.overlayDuration = 0.36;
    this.overlayTimer = 0.36;
  }

  public triggerElimination(): void {
    if (this.eliminatedLocked) return;
    this.eliminatedLocked = true;
    this.overlayTimer = 0;
    this.transitionTo('Elimination', 0.12);
  }

  public reset(): void {
    this.eliminatedLocked = false;
    this.overlayTimer = 0;
    this.mixer.stopAllAction();
    const idle = this.actions.get('Idle');
    if (idle) {
      idle.reset().play();
      this.currentState = 'Idle';
    }
  }

  public update(dt: number, motion: CharacterMotionState): void {
    if (motion.isEliminated) {
      if (!this.eliminatedLocked) {
        this.triggerElimination();
      }
      this.mixer.update(dt);
      return;
    }

    if (this.overlayTimer > 0) {
      this.overlayTimer -= dt;
      if (this.overlayTimer > 0) {
        this.mixer.update(dt);
        return;
      }
    }

    let desired: CharacterAnimState = 'Idle';
    if (!motion.isGrounded) {
      desired = 'Jump';
    } else if (motion.isReloading) {
      desired = 'Reload';
    } else if (motion.isCrouching) {
      desired = 'Crouch';
    } else if (motion.isMoving) {
      desired = motion.isSprinting ? 'Run' : 'Walk';
    } else if (motion.isAiming) {
      desired = 'Aim';
    } else {
      desired = 'Idle';
    }

    if (desired !== this.currentState) {
      const fade =
        desired === 'Jump' || desired === 'Reload'
          ? 0.10
          : desired === 'Aim' || desired === 'Crouch'
            ? 0.14
            : 0.18;
      this.transitionTo(desired, fade);
    }

    // Scale walk/run cycle playback with movement speed for foot-ground coherence
    const activeAction = this.actions.get(this.currentState);
    if (activeAction) {
      if (this.currentState === 'Walk') {
        activeAction.timeScale = Math.max(0.65, Math.min(1.5, motion.moveSpeed / 5.2));
      } else if (this.currentState === 'Run') {
        activeAction.timeScale = Math.max(0.8, Math.min(1.45, motion.moveSpeed / 7.8));
      } else {
        activeAction.timeScale = 1.0;
      }
    }

    this.mixer.update(dt);
  }

  private transitionTo(next: CharacterAnimState, fadeSec: number): void {
    const nextAction = this.actions.get(next);
    if (!nextAction) return;

    const prevAction = this.actions.get(this.currentState);
    if (prevAction && prevAction !== nextAction) {
      nextAction.reset();
      nextAction.enabled = true;
      nextAction.setEffectiveWeight(1);
      nextAction.play();
      prevAction.crossFadeTo(nextAction, fadeSec, false);
    } else {
      nextAction.reset().play();
    }
    this.currentState = next;
  }

  public dispose(): void {
    this.mixer.stopAllAction();
    this.actions.clear();
  }
}
