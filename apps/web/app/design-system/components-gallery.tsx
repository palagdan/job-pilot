'use client';

import type { PipelineStatus, RunFrequency, WorkFormat } from '@job-pilot/shared/enums';
import { pipelineStatuses } from '@job-pilot/shared/enums';
import { messages } from '@job-pilot/shared/limits';
import { useState } from 'react';
import { AppIcon, Logo } from '../../components/brand/logo.tsx';
import { Banner } from '../../components/ui/banner.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Chip, ChipGroup } from '../../components/ui/chip.tsx';
import { ConfirmDialog, Modal } from '../../components/ui/dialog.tsx';
import { Dropzone, type DropzoneState } from '../../components/ui/dropzone.tsx';
import { DropdownMenu, MenuItem, MenuSeparator } from '../../components/ui/dropdown-menu.tsx';
import { EmptyState } from '../../components/ui/empty-state.tsx';
import { SearchableSelect } from '../../components/ui/searchable-select.tsx';
import { Segmented } from '../../components/ui/segmented.tsx';
import { Select } from '../../components/ui/select.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { SplitButton } from '../../components/ui/split-button.tsx';
import { Badge, CvStatusBadge, FitScore, PipelineStatusBadge } from '../../components/ui/status-badge.tsx';
import { Stepper } from '../../components/ui/stepper.tsx';
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/table.tsx';
import { TagInput } from '../../components/ui/tag-input.tsx';
import { TextInput } from '../../components/ui/text-input.tsx';
import { toast } from '../../components/ui/toast.tsx';
import { Toggle } from '../../components/ui/toggle.tsx';
import styles from './design-system.module.css';

const zones = Intl.supportedValuesOf('timeZone').map((z) => ({ value: z, label: z, keywords: [z.split('/').pop() ?? z] }));
const roleSuggestions = ['Head of Growth', 'Head of Growth Marketing', 'Head of Performance Marketing', 'CMO', 'Marketing Director'];

function Demo({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <article className={styles.demo}>
      <header>
        <h3 className={styles.demoTitle}>{title}</h3>
        {note && <p className={styles.muted}>{note}</p>}
      </header>
      {children}
    </article>
  );
}

function State({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.state}>
      <span className={styles.stateLabel}>{label}</span>
      <div className={styles.stateBody}>{children}</div>
    </div>
  );
}

export function ComponentsGallery() {
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState(['CMO']);
  const [formats, setFormats] = useState<WorkFormat[]>(['remote', 'hybrid']);
  const [filter, setFilter] = useState<'all' | 'job' | 'event'>('all');
  const [frequency, setFrequency] = useState<RunFrequency>('daily');
  const [runHour, setRunHour] = useState('8');
  const [zone, setZone] = useState('Europe/Prague');
  const [jobs, setJobs] = useState(true);
  const [events, setEvents] = useState(true);
  const [dropzone, setDropzone] = useState<DropzoneState>({ kind: 'idle' });
  const [modal, setModal] = useState<'none' | 'error' | 'sent' | 'delete'>('none');

  const fakeUpload = (file: File) => {
    let progress = 0;
    const tick = setInterval(() => {
      progress += 20;
      if (progress < 100) return setDropzone({ kind: 'uploading', filename: file.name, progress });
      clearInterval(tick);
      setDropzone({ kind: 'reading' });
      setTimeout(() => setDropzone({ kind: 'done', filename: file.name, pageCount: 2 }), 1200);
    }, 250);
  };

  return (
    <div className={styles.gallery}>
      <Demo title="Logo" note="Compass. Mark color follows the theme (white / ink).">
        <div className={styles.row}>
          <Logo size="sm" />
          <Logo size="md" />
          <Logo size="lg" />
          <AppIcon size="lg" />
        </div>
      </Demo>

      <Demo title="Button" note="Hover 85% · keyboard focus ring · loading keeps width · disabled 35% + reason tooltip">
        <State label="Variants">
          <Button variant="primary">I sent it</Button>
          <Button variant="secondary">Skip</Button>
          <Button variant="danger">Delete</Button>
          <Button variant="ghost">Cancel</Button>
        </State>
        <State label="Loading">
          <Button
            variant="primary"
            loading={saving}
            loadingLabel="Saving..."
            onClick={() => {
              setSaving(true);
              setTimeout(() => setSaving(false), 1500);
            }}
          >
            Save changes
          </Button>
        </State>
        <State label="Disabled">
          <Button variant="primary" disabled disabledReason="Upload a CV to continue.">
            Continue
          </Button>
        </State>
        <State label="Split">
          <SplitButton
            onClick={() => toast('Skipped', { undo: () => toast('Restored') })}
            menuLabel="Skip reasons"
            menu={
              <>
                <MenuItem onSelect={() => toast('Skipped')}>Not relevant</MenuItem>
                <MenuItem onSelect={() => toast('Skipped')}>Wrong location</MenuItem>
                <MenuItem description="Also adds the company to Exclusions" onSelect={() => toast('"Company A" added to exclusions')}>
                  Company excluded
                </MenuItem>
              </>
            }
          >
            Skip
          </SplitButton>
          <DropdownMenu trigger={<Button>Change route</Button>}>
            <MenuItem selected description="Agent picks the best way in">
              Let the agent decide
            </MenuItem>
            <MenuItem description="Apply on the job board or company portal">Direct</MenuItem>
            <MenuSeparator />
            <MenuItem disabled disabledReason="No upcoming events">
              Event
            </MenuItem>
          </DropdownMenu>
        </State>
      </Demo>

      <Demo title="Text input" note="Validate on blur/submit; error under the field">
        <TextInput label="LinkedIn profile URL (optional)" placeholder="linkedin.com/in/your-name" />
        <TextInput label="LinkedIn profile URL" defaultValue="linkedin/user" error={messages.linkedinUrl} />
        <TextInput label="Time zone" value="Europe/Prague" disabled readOnly />
      </Demo>

      <Demo title="Select, searchable select" note="Run time · Time zone (search, empty state)">
        <Select
          label="Run time"
          value={runHour}
          onValueChange={setRunHour}
          options={[6, 7, 8, 9, 10, 12, 18, 20].map((h) => ({
            value: String(h),
            label: `${String(h).padStart(2, '0')}:00`,
            description: h === 8 ? 'Default' : undefined,
          }))}
        />
        <SearchableSelect
          label="Time zone"
          value={zone}
          onValueChange={setZone}
          options={zones}
          searchPlaceholder="Search city or zone"
          emptyText="No time zone found"
        />
        <Select label="Experience" value={undefined} onValueChange={() => {}} error={messages.experienceRequired} options={[{ value: '10_plus', label: '10+ years' }]} />
      </Demo>

      <Demo title="Tag input" note="Enter/comma adds · Backspace removes · 2–40 chars · max 5 · duplicates ignored">
        <TagInput
          label="Target roles"
          value={roles}
          onChange={setRoles}
          suggestions={roleSuggestions}
          max={5}
          itemName="roles"
          error={roles.length === 0 ? messages.rolesRequired : undefined}
        />
      </Demo>

      <Demo title="Chips, toggles, segmented">
        <State label="Filter">
          <ChipGroup
            type="single"
            label="Filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: 6 },
              { value: 'job', label: 'Jobs', count: 6 },
              { value: 'event', label: 'Events', count: 0, disabled: true },
            ]}
          />
        </State>
        <State label="Work format">
          <ChipGroup
            type="multiple"
            label="Work format"
            value={formats}
            onChange={setFormats}
            minSelected={1}
            options={[
              { value: 'remote', label: 'Remote' },
              { value: 'hybrid', label: 'Hybrid' },
              { value: 'onsite', label: 'On-site' },
            ]}
          />
        </State>
        <State label="Static">
          <Chip>Job</Chip>
          <Chip selected>Direct</Chip>
        </State>
        <Toggle
          label="Jobs"
          description="Roles on job boards and company portals"
          checked={jobs}
          onCheckedChange={(v) => (v || events ? setJobs(v) : toast.error(messages.lookForRequired))}
        />
        <Toggle
          label="Events"
          description="Meetups, hackathons, career fairs"
          checked={events}
          onCheckedChange={(v) => (v || jobs ? setEvents(v) : toast.error(messages.lookForRequired))}
        />
        <Toggle label="Push" description="Disabled state" checked disabled onCheckedChange={() => {}} />
        <Segmented
          label="Run frequency"
          value={frequency}
          onValueChange={setFrequency}
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'every_3_days', label: 'Every 3 days' },
            { value: 'weekly', label: 'Weekly' },
          ]}
        />
      </Demo>

      <Demo title="CV dropzone" note="Drop or browse a PDF/DOCX ≤ 5 MB (fake upload)">
        <Dropzone
          state={dropzone}
          onFile={fakeUpload}
          onReject={(message) => setDropzone({ kind: 'error', message })}
        />
        <div className={styles.row}>
          <Button size="sm" onClick={() => setDropzone({ kind: 'idle' })}>
            Reset
          </Button>
          <Button size="sm" onClick={() => setDropzone({ kind: 'error', message: messages.cvUnreadable })}>
            Show error
          </Button>
        </div>
      </Demo>

      <Demo title="Stepper">
        <Stepper steps={['Upload', 'Confirm profile', 'Set targets', 'Schedule']} current={0} />
        <Stepper steps={['Upload', 'Confirm profile', 'Set targets', 'Schedule']} current={2} />
      </Demo>

      <Demo title="Badges">
        <State label="Pipeline">
          {pipelineStatuses.map((s: PipelineStatus) => (
            <PipelineStatusBadge key={s} status={s} />
          ))}
        </State>
        <State label="CV">
          <CvStatusBadge status="needs_review" />
          <CvStatusBadge status="confirmed" />
          <CvStatusBadge status="generating" />
        </State>
        <State label="Other">
          <FitScore score={87} />
          <Badge tone="neutral">Expired</Badge>
        </State>
      </Demo>

      <Demo title="Banners" note="Top of the content area; stay until resolved">
        <Banner title="A new CV was created for you" action={{ label: 'Review CV', href: '/cvs' }}>
          Review and confirm it. The agent prepares application packs only after you do.
        </Banner>
        <Banner tone="warning" title="2 follow-ups are due today" action={{ label: 'Open Pipeline', href: '/pipeline' }}>
          It has been 5 days since you sent these applications.
        </Banner>
        <Banner tone="danger" title="The last run failed" action={{ label: 'Run now', onClick: () => toast('Run started. This takes a few minutes.') }}>
          The agent will try again at the next scheduled time.
        </Banner>
        <Banner tone="neutral" title="Your agent is paused" action={{ label: 'Resume', onClick: () => toast('Agent resumed') }}>
          No runs and no emails until you resume.
        </Banner>
      </Demo>

      <Demo title="Toasts" note="Bottom-center, one at a time (queued) · 4 s · 10 s with Undo · errors stay">
        <div className={styles.row}>
          <Button size="sm" onClick={() => toast('Saved')}>
            Success
          </Button>
          <Button size="sm" onClick={() => toast('Marked as sent', { undo: () => toast('Marked as not sent') })}>
            With Undo
          </Button>
          <Button size="sm" onClick={() => toast.error('Could not save. Check your connection.', { retry: () => toast('Saved') })}>
            Error
          </Button>
          <Button
            size="sm"
            onClick={() => {
              toast('Copied to clipboard');
              toast('CV confirmed');
            }}
          >
            Two (queued)
          </Button>
        </div>
      </Demo>

      <Demo title="Dialogs" note="Esc / click outside close · last button is the main action">
        <div className={styles.row}>
          <Button size="sm" onClick={() => setModal('sent')}>
            C01 Mark as sent
          </Button>
          <Button size="sm" onClick={() => setModal('delete')}>
            C09 Delete account
          </Button>
          <Button size="sm" onClick={() => setModal('error')}>
            E12 Error
          </Button>
        </div>
        <ConfirmDialog
          open={modal === 'sent'}
          onOpenChange={(o) => !o && setModal('none')}
          title="Did you send it to Company A?"
          description="We will mark it as sent today and remind you about a follow-up in 5 days."
          cancelLabel="Not yet"
          confirmLabel="Yes, I sent it"
          onConfirm={() => new Promise((r) => setTimeout(r, 800)).then(() => toast('Marked as sent', { undo: () => {} }))}
        />
        <ConfirmDialog
          open={modal === 'delete'}
          onOpenChange={(o) => !o && setModal('none')}
          tone="danger"
          title="Delete your account?"
          description="Your profile, CVs, drafts and pipeline are deleted for good. Applications already sent cannot be recalled. Type DELETE to confirm."
          confirmLabel="Delete account"
          requireText="DELETE"
          onConfirm={() => toast('Deleted (demo)')}
        />
        <Modal
          open={modal === 'error'}
          onOpenChange={(o) => !o && setModal('none')}
          title="Something went wrong"
          description="It is on our side. Try again; if it repeats, contact support with the code below."
          actions={
            <>
              <Button onClick={() => toast('Copied to clipboard')}>Copy code</Button>
              <Button variant="primary" onClick={() => setModal('none')}>
                Try again
              </Button>
            </>
          }
        >
          <code className={styles.muted}>Error code: JP-500-a1b2c3</code>
        </Modal>
      </Demo>

      <Demo title="Table">
        <Table>
          <THead>
            <Tr>
              <Th>Opportunity</Th>
              <Th>Type</Th>
              <Th>Route</Th>
              <Th>Status</Th>
              <Th>Next follow-up</Th>
            </Tr>
          </THead>
          <TBody>
            <Tr>
              <Td>Head of Growth - Company D</Td>
              <Td>Job</Td>
              <Td>
                <Chip>Direct</Chip>
              </Td>
              <Td>
                <PipelineStatusBadge status="sent" />
              </Td>
              <Td>Follow up on 18 Nov</Td>
            </Tr>
            <Tr>
              <Td>Growth Marketing Meetup</Td>
              <Td>Event</Td>
              <Td>
                <Chip>Event</Chip>
              </Td>
              <Td>
                <PipelineStatusBadge status="registered" />
              </Td>
              <Td>Thu 19 Nov, 18:00</Td>
            </Tr>
          </TBody>
        </Table>
      </Demo>

      <Demo title="Skeleton and empty state">
        <div className={styles.skeletonCard}>
          <Skeleton width={48} height={24} radius="var(--radius-pill)" />
          <div className={styles.grow}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
          </div>
        </div>
        <EmptyState
          title="Nothing matches these filters"
          description="Try another status or type."
          action={<Button size="sm">Clear filters</Button>}
        />
      </Demo>
    </div>
  );
}
