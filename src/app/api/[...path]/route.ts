import { NextRequest } from 'next/server';
import { dispatch } from '@/server/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return dispatch(request, path ?? []);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const PUT = handle;
export const HEAD = handle;
export const OPTIONS = handle;
