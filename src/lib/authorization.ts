
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';

export async function requireRole(allowedRoles: string[]) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Authentication required. Please sign in.' },
      { status: 401 }
    );
  }

  // Fetch current user data instead of trusting an old JWT role.
  const user = await (db as unknown as {
    user: {
      findUnique(args: {
        where: { id: string };
        select: {
          id: true;
          name: true;
          email: true;
          role: true;
          isActive: true;
        };
      }): Promise<{
        id: string;
        name: string | null;
        email: string | null;
        role: string;
        isActive: boolean;
      } | null>;
    };
  }).user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return NextResponse.json(
      { error: 'Your account is inactive or unavailable.' },
      { status: 401 }
    );
  }

  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: 'You do not have permission to perform this action.' },
      { status: 403 }
    );
  }

  return { user };
}
