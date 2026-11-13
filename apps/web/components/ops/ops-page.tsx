'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError, callApi } from '../../lib/api/api-client.ts';
import { PageHeader } from '../shell/page-header.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Skeleton } from '../ui/skeleton.tsx';
import { Badge } from '../ui/status-badge.tsx';
import { Table, TBody, Td, Th, THead, Tr } from '../ui/table.tsx';
import styles from './ops-page.module.css';

const num = (n: number) => new Intl.NumberFormat('en-GB').format(n);
const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className={styles.stat}>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statValue} data-tone={tone}>
        {value}
      </p>
    </div>
  );
}

/** Ops view (admins): Apify sources, inventory, agent runs and LLM usage for the last 7 days. */
export function OpsPage() {
  const ops = useQuery({ queryKey: ['ops'], queryFn: ({ signal }) => callApi('getOps', { signal }), refetchInterval: 60_000 });

  if (ops.isPending) return <Skeleton height={480} radius="16px" />;
  if (ops.isError) {
    return ops.error instanceof ApiError && ops.error.code === 'forbidden' ? (
      <EmptyState title="This page is for the JobPilot team" description="Ask an admin to add your email to ADMIN_EMAILS." />
    ) : (
      <p role="alert">The ops data could not be loaded.</p>
    );
  }

  const d = ops.data;
  const tokens = d.llm.totals.inputTokens + d.llm.totals.outputTokens;
  return (
    <>
      <PageHeader title="Ops" subtitle={`Last ${d.windowDays} days · updated ${when(d.generatedAt)}`} />

      <div className={styles.stats}>
        <Stat label="Active jobs" value={num(d.inventory.activeJobs)} />
        <Stat label="Upcoming events" value={num(d.inventory.upcomingEvents)} />
        <Stat label="Agent runs" value={`${num(d.agentRuns.total)} (${d.agentRuns.active} active)`} />
        <Stat label="Failed runs" value={num(d.agentRuns.failed)} tone={d.agentRuns.failed ? 'danger' : undefined} />
        <Stat label="LLM calls / tokens" value={`${num(d.llm.totals.calls)} / ${num(tokens)}`} />
      </div>

      <section className={styles.section}>
        <h2>Sources (Apify)</h2>
        <Table>
          <THead>
            <Tr>
              <Th>Source</Th>
              <Th>Runs</Th>
              <Th>Failed</Th>
              <Th>Found</Th>
              <Th>Ingested</Th>
              <Th>Cost</Th>
              <Th>Last run</Th>
            </Tr>
          </THead>
          <TBody>
            {d.sources.map((s) => (
              <Tr key={s.key}>
                <Td>
                  <span className={styles.source}>
                    {s.name}
                    <span className={styles.muted}>
                      {s.kind} · {s.key}
                    </span>
                  </span>
                  {!s.enabled && <Badge tone="neutral">Disabled</Badge>}
                </Td>
                <Td>{s.runs}</Td>
                <Td>{s.failedRuns ? <Badge tone="danger">{s.failedRuns}</Badge> : 0}</Td>
                <Td>{num(s.itemsFound)}</Td>
                <Td>{num(s.itemsIngested)}</Td>
                <Td>${s.costUsd.toFixed(2)}</Td>
                <Td>
                  <span className={styles.source}>
                    {when(s.lastRunAt)}
                    {s.lastStatus && <span className={styles.muted}>{s.lastStatus}</span>}
                    {s.lastError && <span className={styles.error}>{s.lastError}</span>}
                  </span>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </section>

      <div className={styles.columns}>
        <section className={styles.section}>
          <h2>LLM by task</h2>
          <Table>
            <THead>
              <Tr>
                <Th>Task</Th>
                <Th>Calls</Th>
                <Th>Failed</Th>
                <Th>Tokens in / out</Th>
              </Tr>
            </THead>
            <TBody>
              {d.llm.byTask.map((t) => (
                <Tr key={t.task}>
                  <Td>{t.task}</Td>
                  <Td>{num(t.calls)}</Td>
                  <Td>{t.failed ? <Badge tone="danger">{t.failed}</Badge> : 0}</Td>
                  <Td>
                    {num(t.inputTokens)} / {num(t.outputTokens)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </section>
        <section className={styles.section}>
          <h2>LLM by user (top 20)</h2>
          <Table>
            <THead>
              <Tr>
                <Th>User</Th>
                <Th>Calls</Th>
                <Th>Tokens</Th>
              </Tr>
            </THead>
            <TBody>
              {d.llm.byUser.map((u) => (
                <Tr key={u.email}>
                  <Td>{u.email}</Td>
                  <Td>{num(u.calls)}</Td>
                  <Td>{num(u.inputTokens + u.outputTokens)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </section>
      </div>
    </>
  );
}
