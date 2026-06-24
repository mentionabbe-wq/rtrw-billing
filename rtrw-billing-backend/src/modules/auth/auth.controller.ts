import { Body, Controller, Post, HttpCode, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  // ---- 2FA (current logged-in user) ----

  @Post('2fa/setup')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  setup2fa(@Req() req: any) {
    return this.auth.setup2fa(req.user.id);
  }

  @Post('2fa/enable')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  enable2fa(@Req() req: any, @Body('token') token: string) {
    return this.auth.enable2fa(req.user.id, token);
  }

  @Post('2fa/disable')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  disable2fa(@Req() req: any, @Body('token') token: string) {
    return this.auth.disable2fa(req.user.id, token);
  }
}
