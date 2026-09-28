import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';
import { prepareFile } from '../lib/image';

interface PresignResponse {
  uploadId: string;
  uploadUrl: string;
  s3Key: string;
}

type Phase = 'idle' | 'preparing' | 'uploading' | 'done' | 'error';

/** PUT a blob to a presigned S3 URL with progress via XHR. */
function putWithProgress(url: string, blob: Blob, contentType: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(blob);
  });
}

export default function Upload() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    try {
      setPhase('preparing');
      const prepared = await prepareFile(file);

      const presign = await apiFetch<PresignResponse>('uploads', {
        method: 'POST',
        body: {
          fileName: prepared.fileName,
          contentType: prepared.contentType,
          fileSize: prepared.blob.size,
        },
      });

      setPhase('uploading');
      setProgress(0);
      await putWithProgress(presign.uploadUrl, prepared.blob, prepared.contentType, setProgress);

      setPhase('done');
      navigate(`/kits/${presign.uploadId}`);
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  const busy = phase === 'preparing' || phase === 'uploading';

  return (
    <div className="page">
      <h2 className="page-title">Upload notes</h2>
      <p className="tagline">PDF, PNG, or JPG · max 10 MB · photos auto-optimized</p>

      <div className="upload-card">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />

        {!busy && (
          <button className="btn btn-lg" onClick={() => inputRef.current?.click()}>
            📷 Take photo / Choose file
          </button>
        )}

        {phase === 'preparing' && (
          <span className="status-row loading">
            <span className="dot" /> Preparing {fileName}…
          </span>
        )}

        {phase === 'uploading' && (
          <>
            <span className="status-row loading">
              <span className="dot" /> Uploading… {progress}%
            </span>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <span className="status-row error">
              <span className="dot" /> {error}
            </span>
            <button className="btn" onClick={() => inputRef.current?.click()}>
              Try again
            </button>
          </>
        )}

        <button className="btn-ghost" onClick={() => navigate('/')} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
