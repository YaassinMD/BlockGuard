
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/authorization';

export async function GET() {
  try {
    const authorization = await requireRole(['ADMIN']);

    if (authorization instanceof NextResponse) {
      return authorization;
    }

    const [
      totalUsers,
      totalManufacturers,
      totalCustomers,
      totalProducts,
      totalVerifications,
      authenticVerifications,
      fakeVerifications,
      activeManufacturers,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { role: 'MANUFACTURER' } }),
      db.user.count({ where: { role: 'CUSTOMER' } }),
      db.product.count(),
      db.verification.count(),
      db.verification.count({ where: { isAuthentic: true } }),
      db.verification.count({ where: { isAuthentic: false } }),
      db.user.count({
        where: {
          role: 'MANUFACTURER',
          isActive: true,
        },
      }),
    ]);

    return NextResponse.json({
      users: {
        total: totalUsers,
        manufacturers: totalManufacturers,
        customers: totalCustomers,
        activeManufacturers,
        inactiveManufacturers:
          totalManufacturers - activeManufacturers,
      },
      products: {
        total: totalProducts,
      },
      verifications: {
        total: totalVerifications,
        authentic: authenticVerifications,
        fake: fakeVerifications,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin statistics failed:', error);

    return NextResponse.json(
      { error: 'Unable to retrieve admin statistics' },
      { status: 500 }
    );
  }
}
