import clsx from 'clsx'
import { ChevronRight, Download, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFetcher } from 'react-router'

import type { AnnotationEvent, AnnotationStatus } from '@/api/annotations'
import Button, { ButtonLink } from '@/components/Button'

import { NOMADIC_BUTTON } from './nomadicButton'
import NomadicMark from './NomadicMark'
import Progress from './Progress'

const ACTIVE_STATES = new Set(['queued', 'preparing', 'uploading', 'ingesting', 'indexing', 'fetching'])

function ActionDetails({ event }: { event: AnnotationEvent }) {
  const transitions = event.gripper_transitions ?? []
  const interactions = event.object_interactions ?? []
  if (!transitions.length && !interactions.length) return null

  return (
    <details className='mt-3'>
      <summary className='keyboard-focus w-fit cursor-pointer text-sm'>Details</summary>
      <dl className='mt-2 grid gap-3 text-sm'>
        {transitions.length > 0 && (
          <div>
            <dt className='font-medium'>Gripper transitions</dt>
            <dd>{transitions.join(', ')}</dd>
          </div>
        )}
        {interactions.length > 0 && (
          <div>
            <dt className='font-medium'>Object interactions</dt>
            <dd>
              <ul className='list-inside list-disc'>
                {interactions.map((interaction) => {
                  const label = typeof interaction === 'string' ? interaction : JSON.stringify(interaction)
                  return <li key={label}>{label}</li>
                })}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </details>
  )
}

// Remembered per browser, so a station that hides the panel keeps it hidden across episodes
const COLLAPSED_KEY = 'nomadic-annotations-collapsed'

function Panel({ summary, children }: { summary?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(COLLAPSED_KEY) !== 'true')
    } catch {
      // Storage can be unavailable; the panel then starts open.
    }
  }, [])
  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem(COLLAPSED_KEY, String(open))
    } catch {
      // Collapsing still works for this page.
    }
  }

  return (
    <section aria-labelledby='annotations-title' className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 id='annotations-title' className='header'>
          <button
            type='button'
            aria-expanded={open}
            aria-controls='annotations-body'
            onClick={toggle}
            className='keyboard-focus flex items-center gap-2 rounded-sm'
          >
            <ChevronRight aria-hidden className={clsx('h-5 w-5 transition-transform', open && 'rotate-90')} />
            Action annotations
            {!open && summary && <span className='text text-adriatic-500 font-normal'>· {summary}</span>}
          </button>
        </h2>
        <span className='text text-adriatic-500 flex items-center gap-1'>
          by <NomadicMark className='text-franka-blue h-3.5 w-3.5' /> Nomadic
        </span>
      </div>
      {open && (
        <div id='annotations-body' className='flex flex-col gap-3'>
          {children}
        </div>
      )}
    </section>
  )
}

function summaryOf(status: AnnotationStatus, active: boolean): string | undefined {
  if (active) return 'In progress'
  if (status.job?.state === 'completed') return `${status.job.events.length} actions`
  if (status.job) return 'Needs attention'
  return undefined
}

export default function EpisodeAnnotations({ id, initialStatus }: { id: string; initialStatus: AnnotationStatus }) {
  const fetcher = useFetcher<{ status?: AnnotationStatus; error?: string }>()
  const status = initialStatus
  const job = status.job
  const active = !!job && ACTIVE_STATES.has(job.state)
  const endpoint = `/api/annotations?episode_id=${encodeURIComponent(id)}`
  const { state } = fetcher

  const canStart = status.can_submit && !active && !job?.remote_started && job?.state !== 'completed'
  const showHand = job?.events.some((event) => !!event.acting_hand) ?? false
  const showObjects = job?.events.some((event) => event.objects.length > 0) ?? false

  if (!status.enabled) return null

  return (
    <Panel summary={summaryOf(status, active)}>
      {!active && job?.state !== 'completed' && (
        <p className='text max-w-[80ch]'>
          Analyze this saved recording with Nomadic to find timestamped robot actions.
        </p>
      )}
      {status.message && (
        <p className='text' role='status'>
          {status.message}
        </p>
      )}
      {canStart && (
        <fetcher.Form method='post' action={endpoint}>
          <button className={NOMADIC_BUTTON} type='submit' disabled={state !== 'idle'}>
            <NomadicMark className='h-4 w-4' /> Auto Annotate with Nomadic
          </button>
        </fetcher.Form>
      )}
      {!active && job?.state === 'interrupted' && job.video_id && (job.analysis_id || job.batch_id) && (
        <fetcher.Form method='post' action={endpoint}>
          <input type='hidden' name='intent' value='refresh' />
          <Button variant='outline' type='submit' disabled={state !== 'idle'}>
            Refresh saved result
          </Button>
        </fetcher.Form>
      )}
      {fetcher.data?.error && !active && job?.state !== 'completed' && (
        <p className='text' role='alert'>
          {fetcher.data.error}
        </p>
      )}
      {job && (
        <>
          {active ? (
            <Progress state={job.state} message={job.message} />
          ) : (
            <p className='text' role='status' aria-live='polite'>
              {job.message}
            </p>
          )}
          {job.warnings.length > 0 && (
            <ul className='text list-inside list-disc'>
              {job.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {(job.viewer_url || job.state === 'completed') && (
            <div className='flex flex-wrap items-center gap-3'>
              {job.viewer_url && (
                <ButtonLink variant='outline' href={job.viewer_url} target='_blank' rel='noreferrer'>
                  <ExternalLink aria-hidden className='h-4 w-4' /> Open in Nomadic Workbench
                </ButtonLink>
              )}
              {job.state === 'completed' && (
                <ButtonLink variant='outline' href={`${endpoint}&download=1`}>
                  <Download aria-hidden className='h-4 w-4' /> Download annotations
                </ButtonLink>
              )}
            </div>
          )}
          {job.state === 'completed' &&
            (job.events.length > 0 ? (
              <div className='overflow-x-auto'>
                <table className='text w-full border-collapse text-left'>
                  <caption className='pb-3 text-left'>Times are seconds from the recording start.</caption>
                  <thead>
                    <tr>
                      {[
                        'Start',
                        'End',
                        'Action',
                        ...(showHand ? ['Hand'] : []),
                        ...(showObjects ? ['Objects'] : []),
                      ].map((label) => (
                        <th key={label} scope='col' className='border-pastel-grey-300 border-b p-2'>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className='divide-pastel-grey-300 divide-y'>
                    {job.events.map((event) => (
                      <tr key={event.event_id}>
                        <td className='p-2 align-top tabular-nums'>{event.start_seconds.toFixed(3)}</td>
                        <td className='p-2 align-top tabular-nums'>{event.end_seconds.toFixed(3)}</td>
                        <td className='p-2 align-top'>
                          <p>{event.description}</p>
                          <div className='mt-2 flex flex-wrap gap-1'>
                            {(event.action_classes?.length
                              ? event.action_classes
                              : event.category
                                ? [event.category]
                                : []
                            ).map((category) => (
                              <span
                                key={category}
                                className='border-pastel-grey-300 bg-pastel-grey-100 inline-block rounded-sm border px-2 py-1 text-xs font-medium'
                              >
                                {category}
                              </span>
                            ))}
                          </div>
                          <ActionDetails event={event} />
                        </td>
                        {showHand && <td className='p-2 align-top'>{event.acting_hand ?? 'Unknown'}</td>}
                        {showObjects && <td className='p-2 align-top'>{event.objects.join(', ') || '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className='text'>No action windows were returned for this recording.</p>
            ))}
          {(job.ingest_id || job.video_id || job.index_run_id) && (
            <details className='text'>
              <summary className='keyboard-focus cursor-pointer'>Nomadic references</summary>
              <dl className='mt-2 grid gap-2 break-all'>
                {(
                  [
                    ['Upload', job.ingest_id],
                    ['Video', job.video_id],
                    ['Batch', job.batch_id],
                    ['Annotation run', job.index_run_id],
                    ['Analysis', job.analysis_id],
                  ] as const
                )
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt className='font-medium'>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
            </details>
          )}
        </>
      )}
    </Panel>
  )
}
