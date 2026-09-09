import { Controller, Post } from '@nestjs/common';
import { GeneratedUser, UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('generate')
  generate(): Promise<GeneratedUser> {
    return this.userService.generate();
  }
}
