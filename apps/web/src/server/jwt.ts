import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { AuthenticatedUser } from './common/types';

function secret() {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? 'orderflow-dev-secret-change-me');
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

export async function userFromToken(token: string): Promise<AuthenticatedUser> {
  const payload = await new Jwt().verifyAsync<{
    sub: string;
    restaurant_id: string;
    email: string;
    name: string;
    role: AuthenticatedUser['role'];
  }>(token);
  return {
    id: payload.sub,
    restaurantId: payload.restaurant_id,
    email: payload.email,
    fullName: payload.name,
    role: payload.role,
  };
}
