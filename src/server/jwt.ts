import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { AuthenticatedUser } from './common/types';

function secret() {
  const value = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!value || value.length < 32 || /change-me/i.test(value))) {
    throw new Error('Configure a strong JWT_SECRET before serving venue sessions.');
  }
  return new TextEncoder().encode(value ?? 'orderflow-dev-secret-change-me');
}

export class Jwt {
  signAsync(payload: JWTPayload & Record<string, unknown>) {
    return new SignJWT(payload as JWTPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(process.env.JWT_EXPIRES_IN ?? '12h')
      .sign(secret());
  }

  async verifyAsync<T extends JWTPayload>(token: string): Promise<T> {
    const { payload } = await jwtVerify(token, secret());
    return payload as T;
  }
}

export async function userFromToken(token: string): Promise<AuthenticatedUser & { sessionVersion: number }> {
  const payload = await new Jwt().verifyAsync<{
    sub: string;
    restaurant_id: string;
    email: string;
    name: string;
    role: AuthenticatedUser['role'];
    session_version?: number;
  }>(token);
  return {
    id: payload.sub,
    restaurantId: payload.restaurant_id,
    email: payload.email,
    fullName: payload.name,
    role: payload.role,
    sessionVersion: payload.session_version ?? 0,
  };
}
