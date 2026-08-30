import { getNeonAuth, isNeonAuthConfigured } from '@/lib/auth/neon';
import { NextResponse } from 'next/server';

type Context = { params: Promise<{ path: string[] }> };

function unavailable() {
  return NextResponse.json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Neon Auth is not configured.' } }, { status: 503 });
}

export function GET(request: Request, context: Context) {
  return isNeonAuthConfigured() ? getNeonAuth().handler().GET(request, context) : unavailable();
}

export function POST(request: Request, context: Context) {
  return isNeonAuthConfigured() ? getNeonAuth().handler().POST(request, context) : unavailable();
}

export function PUT(request: Request, context: Context) {
  return isNeonAuthConfigured() ? getNeonAuth().handler().PUT(request, context) : unavailable();
}

export function PATCH(request: Request, context: Context) {
  return isNeonAuthConfigured() ? getNeonAuth().handler().PATCH(request, context) : unavailable();
}

export function DELETE(request: Request, context: Context) {
  return isNeonAuthConfigured() ? getNeonAuth().handler().DELETE(request, context) : unavailable();
}
