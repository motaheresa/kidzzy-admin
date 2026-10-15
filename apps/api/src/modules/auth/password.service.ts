import { Injectable, OnModuleInit } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** Hashes and checks passwords with argon2id (ADR-0005). */
@Injectable()
export class PasswordService implements OnModuleInit {
  /** Hash of a random string, checked when no user matches so every failed login takes as long. */
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash(`dummy-${Math.random()}`);
  }

  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false; // a malformed stored hash counts as a wrong password
    }
  }

  /**
   * Spends the same time as a real check. Without it, "no such user" would answer faster than
   * "wrong password", and the response time would reveal which emails have accounts.
   */
  async verifyNothing(password: string): Promise<void> {
    await this.verify(this.dummyHash, password);
  }
}
