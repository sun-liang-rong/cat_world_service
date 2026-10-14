import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { randomInt } from 'node:crypto';
import { User } from './entities/user.entity';
import { NameGenerator } from './name-generator';
import { createSubmitToken } from './submit-token';

export interface GeneratedUser {
  name: string;
  user_id: string;
  submit_token: string;
}

const MAX_ATTEMPTS = 80;
const USER_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly names: NameGenerator,
  ) {}

  async generate(): Promise<GeneratedUser> {
    const triedIds = new Set<string>();

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const userId = this.pickUserId(triedIds);
      // 昵称带唯一匿名 ID 后缀，不受基础名字池容量限制；并发碰撞交给唯一键重试。
      const name = this.names.pickForUser(userId);
      const credential = createSubmitToken();

      try {
        const saved = await this.users.save(
          this.users.create({ name, userId, submitTokenHash: credential.hash }),
        );
        return {
          name: saved.name,
          user_id: saved.userId,
          submit_token: credential.token,
        };
      } catch (error) {
        if (isDuplicateKey(error)) {
          continue;
        }
        this.logger.error('生成用户失败', error instanceof Error ? error.stack : undefined);
        throw error;
      }
    }

    throw new ServiceUnavailableException('暂时无法生成可用昵称，请稍后重试');
  }

  private pickUserId(exclude: Set<string>): string {
    for (let i = 0; i < 16; i += 1) {
      const userId = randomUserId();
      if (!exclude.has(userId)) {
        exclude.add(userId);
        return userId;
      }
    }
    const fallback = randomUserId();
    exclude.add(fallback);
    return fallback;
  }
}

function randomUserId(): string {
  let value = '';
  for (let i = 0; i < 8; i += 1) {
    value += USER_ID_CHARS[randomInt(USER_ID_CHARS.length)];
  }
  return value;
}

function isDuplicateKey(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as { code?: string } | undefined;
  return driverError?.code === 'ER_DUP_ENTRY';
}
