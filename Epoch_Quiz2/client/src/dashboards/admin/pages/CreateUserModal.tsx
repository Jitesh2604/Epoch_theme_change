import { useState } from 'react';
import { Button, Modal } from '../../shared/ui';
import { userApi } from '../../../hooks/useUsers';

type ToastKind = 'success' | 'danger' | 'info';

interface CreateUserModalProps {
  open: boolean;
  role: 'TEACHER' | 'STUDENT';
  onClose: () => void;
  onCreated: () => void;
  push: (t: { kind?: ToastKind; title: string; sub?: string }) => void;
}

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CreateUserModal({ open, role, onClose, onCreated, push }: CreateUserModalProps) {
  const noun = role === 'TEACHER' ? 'Teacher' : 'Student';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setName(''); setEmail(''); setPassword(''); setSchoolName(''); };
  const close = () => { if (!submitting) { reset(); onClose(); } };

  const handleCreate = async () => {
    if (name.trim().length < 2) { push({ kind: 'danger', title: 'Name must be at least 2 characters' }); return; }
    if (!EMAIL_RE.test(email.trim())) { push({ kind: 'danger', title: 'Enter a valid email address' }); return; }
    if (password.length < 8) { push({ kind: 'danger', title: 'Password must be at least 8 characters' }); return; }

    setSubmitting(true);
    try {
      await userApi.create({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        schoolName: schoolName.trim() || undefined,
      });
      push({ kind: 'success', title: `${noun} created` });
      reset();
      onClose();
      onCreated();
    } catch (e: any) {
      push({ kind: 'danger', title: `Failed to create ${noun.toLowerCase()}`, sub: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Add ${noun.toLowerCase()}`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={handleCreate} disabled={submitting}>{submitting ? 'Creating…' : `Create ${noun.toLowerCase()}`}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-semibold text-fg2 block mb-1.5">Full name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={`${noun} name`} className={inputCls} />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-fg2 block mb-1.5">Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="name@school.edu" className={inputCls} />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-fg2 block mb-1.5">Temporary password</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="At least 8 characters" className={inputCls} />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-fg2 block mb-1.5">School <span className="text-fg4 font-normal">(optional)</span></label>
          <input value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="School name" className={inputCls} />
        </div>
      </div>
    </Modal>
  );
}
