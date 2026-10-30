// Site photos (upload up to six, view in a lightbox, delete) and the "Analyse with Claude" panel
// with its long-running progress state.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, ImagePlus, Images, Loader2, Maximize2, PenLine, Sparkles, Trash2 } from 'lucide-react';
import { api, shrinkImage } from '../../lib/api.js';
import { cn } from '../../lib/format.js';
import { Alert, Button, Card, Modal, Tag, useFeedback } from '../../components/ui.jsx';
import { MAX_PHOTOS } from './shared.js';

const photoUrl = (estimateId, photoId) => `/api/erp/estimates/${estimateId}/photos/${photoId}`;

function Thumb({ src, alt, onOpen, onDelete, locked }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-paper">
      {failed ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-muted"><ImageOff size={22} />Unavailable</div>
      ) : (
        <button type="button" onClick={onOpen} className="block h-full w-full" title="View photo">
          <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
        </button>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-1 p-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        {!failed && <button type="button" onClick={onOpen} className="pointer-events-auto rounded-md bg-white/90 p-1 text-ink shadow hover:bg-white" title="View larger" aria-label="View larger"><Maximize2 size={14} /></button>}
        {!locked && <button type="button" onClick={onDelete} className="pointer-events-auto rounded-md bg-white/90 p-1 text-red-600 shadow hover:bg-red-600 hover:text-white" title="Delete photo" aria-label="Delete photo"><Trash2 size={14} /></button>}
      </div>
    </div>
  );
}

function Lightbox({ estimateId, photos, index, setIndex, onClose, onDelete, locked }) {
  const photo = photos[index];
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(photos.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, setIndex]);
  if (!photo) return null;
  return (
    <Modal title={`Site photo ${index + 1} of ${photos.length}`} icon={Images} size="xl" onClose={onClose}
      footer={<>
        {!locked && <Button variant="danger" icon={Trash2} onClick={() => onDelete(photo)} className="sm:mr-auto">Delete photo</Button>}
        <Button variant="secondary" icon={ChevronLeft} disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</Button>
        <Button variant="secondary" disabled={index === photos.length - 1} onClick={() => setIndex(index + 1)}>Next <ChevronRight size={18} /></Button>
      </>}>
      <div className="flex min-h-[40vh] items-center justify-center rounded-lg bg-olive/95 p-2">
        <img src={photoUrl(estimateId, photo.id)} alt={`Site photo ${index + 1}`} className="max-h-[65vh] w-auto rounded object-contain" />
      </div>
    </Modal>
  );
}

export function PhotosCard({ estimate, locked, onChanged }) {
  const { toast, confirm } = useFeedback();
  const input = useRef(null);
  const [uploading, setUploading] = useState(null);
  const [view, setView] = useState(-1);
  const photos = estimate.photos || [];
  const room = MAX_PHOTOS - photos.length;

  const upload = async (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = '';
    if (!picked.length) return;
    const files = picked.slice(0, room);
    if (picked.length > room) toast(`Only ${room} more photo${room === 1 ? '' : 's'} can be added (maximum ${MAX_PHOTOS}).`, 'warning');
    let done = 0;
    try {
      for (const file of files) {
        setUploading({ done, total: files.length });
        const data = await shrinkImage(file);
        await api.post(`/estimates/${estimate.id}/photos`, { data, contentType: 'image/jpeg' });
        done += 1;
      }
      toast(`${done} photo${done === 1 ? '' : 's'} uploaded.`);
    } catch (err) {
      toast(err.message || 'Could not read that photo.', 'error');
    } finally {
      setUploading(null);
      if (done) onChanged();
    }
  };
  const remove = async (photo) => {
    const ok = await confirm({ title: 'Delete this photo?', message: 'It is removed from the estimate and from storage.', confirmLabel: 'Delete photo', tone: 'danger' });
    if (!ok) return;
    try {
      await api.del(`/estimates/${estimate.id}/photos/${photo.id}`);
      setView(-1);
      toast('Photo deleted.');
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <Card title="Site Photos" icon={Images} actions={<Tag className={cn(photos.length >= MAX_PHOTOS && 'bg-brand-tint text-brand-dark')}>{photos.length} / {MAX_PHOTOS}</Tag>}>
      <div className="grid grid-cols-3 gap-2.5">
        {photos.map((photo, i) => (
          <Thumb key={photo.id} src={photoUrl(estimate.id, photo.id)} alt={`Site photo ${i + 1}`} locked={locked} onOpen={() => setView(i)} onDelete={() => remove(photo)} />
        ))}
        {uploading && (
          <div className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-gold bg-brand-soft text-center text-[11px] font-semibold text-brand">
            <Loader2 size={20} className="animate-spin" />Uploading {uploading.done + 1}/{uploading.total}
          </div>
        )}
        {!locked && !uploading && room > 0 && (
          <button type="button" onClick={() => input.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line bg-paper/50 p-2 text-center text-xs font-semibold text-muted transition-colors hover:border-brand-gold hover:bg-brand-soft hover:text-brand">
            <ImagePlus size={24} />{photos.length ? 'Add more' : 'Add photos'}
          </button>
        )}
      </div>
      {!photos.length && !uploading && (
        <p className="mt-3 text-xs leading-relaxed text-muted">{locked ? 'No photos were added to this estimate.' : 'Add up to six clear photos of the damage, with a wide shot for context. Large phone photos are resized before upload.'}</p>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={upload} />
      {view >= 0 && <Lightbox estimateId={estimate.id} photos={photos} index={view} setIndex={setView} onClose={() => setView(-1)} onDelete={remove} locked={locked} />}
    </Card>
  );
}

const STAGES = ['Reading the site brief', 'Looking closely at each photo', 'Working out the scope, stage by stage', 'Pricing material and labour at local rates', 'Writing assumptions and exclusions'];

export function AnalysePanel({ estimate, hasItems, running, error, onAnalyse, onManual, onDismiss }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) { setSeconds(0); return undefined; }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const photos = estimate.photos?.length || 0;
  const stage = STAGES[Math.min(STAGES.length - 1, Math.floor(seconds / 12))];
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const notConfigured = error?.status === 503;

  return (
    <Card title="Analyse with Claude" icon={Sparkles} className={cn(running && 'border-brand-gold')}>
      {running ? (
        <div className="flex flex-col items-center py-2 text-center" role="status" aria-live="polite">
          <div className="relative mb-3 flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 animate-spin rounded-full border-4 border-brand-tint border-t-brand" />
            <Sparkles size={20} className="text-brand" />
          </div>
          <p className="text-sm font-bold text-ink">Claude is studying {photos} photo{photos === 1 ? '' : 's'}…</p>
          <p className="mt-1 text-xs font-medium text-brand">{stage}</p>
          <p className="mt-2 font-mono text-xs text-muted">{clock}</p>
          <p className="mt-3 text-xs leading-relaxed text-muted">This usually takes one to three minutes. Keep this page open; the lines appear below when it finishes.</p>
        </div>
      ) : (
        <>
          {error && (
            <Alert tone={notConfigured ? 'warning' : 'error'} onClose={onDismiss}>
              {notConfigured && <p className="mb-1 font-bold">AI analysis is not switched on yet</p>}
              <p>{error.message}</p>
              {notConfigured && <p className="mt-1.5">Meanwhile you can enter the estimate lines by hand.</p>}
            </Alert>
          )}
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Claude reads the photos and the brief, then drafts a staged bill of quantities with material, labour and other costs, a low–high range, assumptions and exclusions. Nothing is sent to the customer until you approve.
          </p>
          <Button icon={Sparkles} className="w-full" disabled={!photos} onClick={onAnalyse}>{hasItems && estimate.aiAnalysed ? 'Re-analyse with Claude' : 'Analyse with Claude'}</Button>
          {!photos && <p className="mt-2 text-center text-xs text-muted">Upload at least one site photo first.</p>}
          <button type="button" onClick={onManual} className="mx-auto mt-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand hover:text-brand-dark">
            <PenLine size={13} /> {hasItems ? 'Add a line by hand' : 'Or enter lines by hand'}
          </button>
        </>
      )}
    </Card>
  );
}
