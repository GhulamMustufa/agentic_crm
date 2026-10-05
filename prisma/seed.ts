import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = `${process.env.DATABASE_URL}`
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter });
async function main() {
  console.log('Starting database seeding...');

  // 1. Create a dummy Tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Agentic CRM Inc.',
    },
  });
  console.log(`Created Tenant: ${tenant.name} (ID: ${tenant.id})`);

  // 2. Create mock Exceptions
  const exceptions = await Promise.all([
    prisma.exception.create({
      data: {
        tenantId: tenant.id,
        type: 'UNKNOWN_TRANSACTION',
        severity: 'high',
        description: 'Large wire transfer to an unrecognized offshore vendor.',
        aiProposal: 'Recommend holding the transaction and requesting vendor W-8BEN and contract details before approving.',
        status: 'OPEN',
        amount: 250000.00,
      },
    }),
    prisma.exception.create({
      data: {
        tenantId: tenant.id,
        type: 'DUPLICATE',
        severity: 'medium',
        description: 'Possible duplicate SaaS subscription payment.',
        aiProposal: 'This closely matches a payment made to Adobe Inc. on the 1st of the month. Recommend merging or rejecting.',
        status: 'OPEN',
        amount: 149.99,
      },
    }),
    prisma.exception.create({
      data: {
        tenantId: tenant.id,
        type: 'MISSING_RECEIPT',
        severity: 'low',
        description: 'Team dinner expense missing itemized receipt.',
        aiProposal: 'Auto-email the employee to upload the receipt from the POS system.',
        status: 'OPEN',
        amount: 345.50,
      },
    }),
  ]);

  console.log(`Created ${exceptions.length} Exceptions.`);
  console.log('Database seeding complete! 🌱');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
