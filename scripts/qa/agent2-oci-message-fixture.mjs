// Executed only INSIDE the frozen API OCI image, against the harness-proven
// ephemeral PostgreSQL data directory. No host source imports, network requests
// or production accounts. Invocation payload arrives on stdin, not CLI args.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prisma } from '@gafus/prisma';
import { generateAccessToken } from '@gafus/auth/jwt';
const payload = JSON.parse(readFileSync(0,'utf8') || '{}');
try {
  if (process.env.GAFUS_AGENT2_OCI_FIXTURE_ACTION === 'create') {
    const out = {};
    for (const role of ['owner','member','outsider']) {
      const id = randomUUID().replaceAll('-','').slice(0,12);
      const user = await prisma.user.create({ data: {
        username: `agent2_oci_${role}_${id}`,
        email: `agent2_oci_${role}_${id}@example.invalid`,
        password: 'synthetic-no-login', registrationPending:false,
      },select:{id:true,username:true,role:true} });
      out[role] = { id:user.id, token:await generateAccessToken(user) };
    }
    console.log(JSON.stringify({actors:out}));
  } else if (process.env.GAFUS_AGENT2_OCI_FIXTURE_ACTION === 'counts') {
    if (!/^[a-zA-Z0-9_-]{8,60}$/.test(payload.room ?? '') ||
        !/^[a-zA-Z0-9_-]{8,80}$/.test(payload.messageId ?? '') ||
        !/^[0-9a-f-]{36}$/.test(payload.clientMessageId ?? ''))
      throw new Error('INVALID_OCI_FIXTURE_SELECTOR');
    const [messages,outboxes,delivery] = await Promise.all([
      prisma.chat2Message.count({where:{conversationId:payload.room,clientMessageId:payload.clientMessageId}}),
      prisma.chat2OutboxEvent.count({where:{messageId:payload.messageId}}),
      prisma.chat2OutboxEvent.findFirst({where:{messageId:payload.messageId}, select:{deliveredAt:true}}),
    ]);
    console.log(JSON.stringify({messages,outboxes,delivered:!!delivery?.deliveredAt}));
  } else throw new Error('UNAPPROVED_OCI_FIXTURE_ACTION');
} finally { await prisma.$disconnect(); }
