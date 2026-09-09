import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { NameGenerator } from './name-generator';

export interface GeneratedUser {
  name: string;
  user_id: string;
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
    const triedNames = new Set<string>();
    const triedIds = new Set<string>();

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      let name: string;
      try {
        name = this.names.pick(triedNames);
      } catch {
        break;
      }
      const userId = this.pickUserId(triedIds);

      const nameTaken = await this.users.existsBy({ name });
      if (nameTaken) {
        continue;
      }

      const idTaken = await this.users.existsBy({ userId });
      if (idTaken) {
        continue;
      }

      try {
        const saved = await this.users.save(
          this.users.create({ name, userId }),
        );
        return {
          name: saved.name,
          user_id: saved.userId,
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
    value += USER_ID_CHARS[Math.floor(Math.random() * USER_ID_CHARS.length)];
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
