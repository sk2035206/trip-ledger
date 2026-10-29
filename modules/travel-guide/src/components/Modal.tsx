import { useEffect, useRef, useId, type ReactNode } from 'react';
import { Icon } from './Icon';
export function Modal({ title, children, onClose, wide = false }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    wide?: boolean;
}) {
    const ref = useRef<HTMLDialogElement>(null), titleId = useId();
    useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => { previous?.focus(); }; }, []);
    return <dialog ref={ref} aria-labelledby={titleId} className={`modal ${wide ? 'wide' : ''}`} onCancel={event => { event.preventDefault(); onClose(); }}><div className="modal-heading"><div><span className="eyebrow">YOUR NEXT STOP</span><h2 id={titleId}>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭弹窗"><Icon name="close"/></button></div>{children}</dialog>;
}
