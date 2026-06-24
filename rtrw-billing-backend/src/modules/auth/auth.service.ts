import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { User } from '@database/entities';
import { CryptoService } from '@common/crypto/crypto.service';
import { LoginDto } from './dto/login.dto';

const ISSUER = 'RTRW Net Billing';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
  ) {}

  async validateUser(dto: LoginDto): Promise<User> {
    const user = await this.users.findOne({ where: { email: dto.email, isActive: true } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto);

    // Second factor, if enabled for this account.
    if (user.totpEnabled) {
      if (!dto.token) return { twoFactorRequired: true };
      if (!this.verifyToken(user, dto.token)) {
        throw new UnauthorizedException('Invalid 2FA token');
      }
    }

    return this.issueTokens(user);
  }

  private async issueTokens(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload, {
        secret: this.config.get('jwt.secret'),
        expiresIn: this.config.get('jwt.expires'),
      }),
      refreshToken: await this.jwt.signAsync(payload, {
        secret: this.config.get('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshExpires'),
      }),
      user: { id: user.id, email: user.email, role: user.role, totpEnabled: user.totpEnabled },
    };
  }

  // ---------------- 2FA (TOTP) ----------------

  /** Generate a secret (stored encrypted, not yet enabled) + provisioning URI. */
  async setup2fa(userId: string) {
    const user = await this.getUser(userId);
    const secret = authenticator.generateSecret();
    user.totpSecretEnc = this.crypto.encrypt(secret);
    user.totpEnabled = false;
    await this.users.save(user);
    return {
      secret,
      otpauthUrl: authenticator.keyuri(user.email, ISSUER, secret),
    };
  }

  /** Verify a token against the pending secret and turn 2FA on. */
  async enable2fa(userId: string, token: string) {
    const user = await this.getUser(userId);
    if (!user.totpSecretEnc) throw new BadRequestException('Run setup first');
    if (!this.verifyToken(user, token)) throw new BadRequestException('Invalid token');
    user.totpEnabled = true;
    await this.users.save(user);
    return { enabled: true };
  }

  /** Disable 2FA (requires a valid current token). */
  async disable2fa(userId: string, token: string) {
    const user = await this.getUser(userId);
    if (!user.totpEnabled || !this.verifyToken(user, token)) {
      throw new BadRequestException('Invalid token');
    }
    user.totpEnabled = false;
    user.totpSecretEnc = null;
    await this.users.save(user);
    return { enabled: false };
  }

  private verifyToken(user: User, token: string): boolean {
    const secret = this.crypto.decrypt(user.totpSecretEnc);
    if (!secret) return false;
    return authenticator.verify({ token, secret });
  }

  private async getUser(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  /** Helper for the seeder / user creation. */
  static hash(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  }
}
