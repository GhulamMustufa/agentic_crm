import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ Error: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function resetTenantData(targetTenantId = 'fd552037-fc94-40b7-aa7d-b3c387c954f9') {
  console.log(`\n🧹 Starting complete fresh data reset for tenant: ${targetTenantId}`);

  await prisma.$transaction(async (tx) => {
    // 1. Delete ReconciledTransactions & Proposals
    const deletedReconciled = await tx.reconciledTransaction.deleteMany({
      where: { tenantId: targetTenantId },
    });
    const deletedProposals = await tx.proposal.deleteMany({
      where: { tenantId: targetTenantId },
    });
    const deletedBankingExceptions = await tx.bankingExceptionItem.deleteMany({
      where: { tenantId: targetTenantId },
    });
    const deletedExceptions = await tx.exception.deleteMany({
      where: { tenantId: targetTenantId },
    });

    // 2. Delete Bank Transactions & Statements
    const deletedBankTx = await tx.bankTransaction.deleteMany({
      where: { tenantId: targetTenantId },
    });
    const deletedStatements = await tx.bankStatement.deleteMany({
      where: { tenantId: targetTenantId },
    });

    // 3. Delete Payment Allocations & Payments
    const deletedAllocations = await tx.paymentAllocation.deleteMany({
      where: { tenantId: targetTenantId },
    });
    const deletedPayments = await tx.payment.deleteMany({
      where: { tenantId: targetTenantId },
    });

    // 4. Delete Invoice Lines & Invoices
    const deletedInvLines = await tx.invoiceLine.deleteMany({
      where: { tenantId: targetTenantId },
    });
    const deletedInvoices = await tx.invoice.deleteMany({
      where: { tenantId: targetTenantId },
    });

    // 5. Delete Journal Entry Lines & Journal Entries
    const deletedJournalLines = await tx.journalEntryLine.deleteMany({
      where: { tenantId: targetTenantId },
    });
    const deletedJournals = await tx.journalEntry.deleteMany({
      where: { tenantId: targetTenantId },
    });

    // 6. Delete Account Monthly Balances
    const deletedBalances = await tx.accountMonthlyBalance.deleteMany({
      where: { tenantId: targetTenantId },
    });

    // 7. Reset Bank Account balances to 0
    const resetBankAccounts = await tx.bankAccount.updateMany({
      where: { tenantId: targetTenantId },
      data: {
        currentBalanceCents: 0n,
        reconciledBalanceCents: 0n,
      },
    });

    // 8. Ensure Mercury Commercial Checking exists for USD statements
    const cashAcc = await tx.chartOfAccount.findFirst({
      where: { tenantId: targetTenantId, accountCode: '1010' },
    });
    if (cashAcc) {
      const mercury = await tx.bankAccount.findFirst({
        where: { tenantId: targetTenantId, institutionName: 'Mercury Bank' },
      });
      if (!mercury) {
        await tx.bankAccount.create({
          data: {
            tenantId: targetTenantId,
            ledgerAccountId: cashAcc.id,
            accountName: 'Mercury Commercial Checking',
            institutionName: 'Mercury Bank',
            accountType: 'CHECKING',
            currency: 'USD',
            accountNumberLast4: '8841',
            currentBalanceCents: 0n,
            reconciledBalanceCents: 0n,
            isActive: true,
          },
        });
        console.log(' • Created linked Mercury Commercial Checking account for USD statements');
      }
    }

    console.log('✅ Cleanup Report:');
    console.log(` • Invoices deleted:            ${deletedInvoices.count} (Lines: ${deletedInvLines.count})`);
    console.log(` • Journal Entries deleted:     ${deletedJournals.count} (Lines: ${deletedJournalLines.count})`);
    console.log(` • Bank Statements deleted:     ${deletedStatements.count}`);
    console.log(` • Bank Transactions deleted:   ${deletedBankTx.count}`);
    console.log(` • Reconciled Tx deleted:       ${deletedReconciled.count}`);
    console.log(` • Proposals deleted:           ${deletedProposals.count}`);
    console.log(` • Exceptions deleted:          ${deletedBankingExceptions.count + deletedExceptions.count}`);
    console.log(` • Payments deleted:            ${deletedPayments.count} (Allocations: ${deletedAllocations.count})`);
    console.log(` • Monthly Balances reset:      ${deletedBalances.count}`);
    console.log(` • Bank Accounts reset to 0:    ${resetBankAccounts.count}`);
  }, { timeout: 30000, maxWait: 15000 });

  console.log(`✨ Tenant ${targetTenantId} is completely clean and ready for a fresh demonstration!`);
}

const target = process.argv[2] || 'fd552037-fc94-40b7-aa7d-b3c387c954f9';
resetTenantData(target)
  .catch((err) => {
    console.error('❌ Reset failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
