import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Rank } from './entities/rank.entity';
import { RankController } from './rank.controller';
import { RankService } from './rank.service';

@Module({
  imports: [TypeOrmModule.forFeature([Rank, User])],
  controllers: [RankController],
  providers: [RankService],
})
export class RankModule {}
