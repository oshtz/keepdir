import React, { forwardRef, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils';

/* ─────────────────────────────────────────────────────────────────────────── */
/* Primitives                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary', className)}>
      {children}
    </span>
  );
}

export function Panel({
  children,
  className,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn('kd-rise kd-shell min-h-0', className)} style={{ animationDelay: `${delay}ms`, ...style }}>
      <div className="kd-core h-full w-full overflow-hidden flex flex-col min-h-0">{children}</div>
    </div>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  badge,
  compact = false,
  divider = true,
  actions,
}: {
  eyebrow: string;
  title: string;
  badge?: string;
  compact?: boolean;
  divider?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn('flex-shrink-0 flex items-center justify-between gap-3', compact ? 'px-3 py-1.5' : 'px-5 py-3', divider && 'border-b border-border')}>
      <div className="min-w-0">
        <Eyebrow>{eyebrow}</Eyebrow>
        <div className="font-display font-semibold text-[17px] leading-tight tracking-[-0.01em] truncate text-balance">{title}</div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2.5">
        {actions}
        {badge && (
          <span className="flex-shrink-0 font-mono text-[11px] text-text-secondary border border-border rounded-[var(--radius-md)] px-2.5 py-0.5">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Button                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, className, variant = 'secondary', size = 'md', leftIcon, rightIcon, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'group inline-flex items-center justify-center gap-2 font-header font-semibold whitespace-nowrap select-none kd-focus',
          'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          'active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none',
          size === 'md' ? 'px-4 py-2.5 text-sm rounded-[var(--radius-md)]' : 'px-3 py-1.5 text-xs rounded-[var(--radius-md)]',
          variant === 'primary' && 'bg-accent text-accent-ink hover:brightness-105',
          variant === 'secondary' &&
            'bg-surface border border-border text-text hover:border-border-hover',
          variant === 'ghost' && 'bg-transparent text-text-secondary hover:text-text hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
          className
        )}
        {...props}
      >
        {leftIcon}
        {children}
        {rightIcon && (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-[var(--radius-sm)] bg-black/[0.05] dark:bg-white/[0.10] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px">
            {rightIcon}
          </span>
        )}
      </button>
    );
  }
);
Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: React.ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, className, label, ...props }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={label}
        className={cn(
          'inline-flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] text-text-secondary kd-focus',
          'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          'hover:text-text hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-[0.96] disabled:opacity-40 disabled:pointer-events-none',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
IconButton.displayName = 'IconButton';

/* ─────────────────────────────────────────────────────────────────────────── */
/* Inputs                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  inputClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, className, inputClassName, id, ...props }, ref) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
    <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-header font-semibold text-text-secondary">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'w-full px-3 py-2 text-sm bg-black/[0.04] dark:bg-white/[0.05] border border-border',
          'rounded-[var(--radius-md)] text-text placeholder:text-text-secondary/60',
          'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          'focus:outline-none focus:border-border-hover focus:ring-2 focus:ring-accent/30',
          inputClassName
        )}
        {...props}
      />
    </div>
  );
});
Input.displayName = 'Input';

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(({ label, className, id, ...props }, ref) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
    <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-header font-semibold text-text-secondary">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        className={cn(
          'w-full px-3 py-2 text-sm bg-black/[0.04] dark:bg-white/[0.05] border border-border',
          'rounded-[var(--radius-md)] text-text placeholder:text-text-secondary/60 resize-y min-h-[64px]',
          'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          'focus:outline-none focus:border-border-hover focus:ring-2 focus:ring-accent/30'
        )}
        {...props}
      />
    </div>
  );
});
TextArea.displayName = 'TextArea';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, className, id, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    return (
      <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
        {label && (
          <label htmlFor={selectId} className="text-xs font-header font-semibold text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full appearance-none px-3 py-2 pr-8 text-sm bg-black/[0.04] dark:bg-white/[0.05] border border-border',
              'rounded-[var(--radius-md)] text-text',
              'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
              'focus:outline-none focus:border-border-hover focus:ring-2 focus:ring-accent/30'
            )}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
    );
  }
);
Select.displayName = 'Select';

interface ComboboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  options: string[];
}

export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(
  ({ label, options, className, id, value, onChange, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const listId = `${inputId}-list`;
    const [open, setOpen] = useState(false);
    return (
      <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
        {label && (
          <label htmlFor={inputId} className="text-xs font-header font-semibold text-text-secondary">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          list={listId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          value={value}
          onChange={onChange}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className={cn(
            'w-full px-3 py-2 text-sm bg-black/[0.04] dark:bg-white/[0.05] border border-border',
            'rounded-[var(--radius-md)] text-text placeholder:text-text-secondary/60',
            'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
            'focus:outline-none focus:border-border-hover focus:ring-2 focus:ring-accent/30'
          )}
          {...props}
        />
        <datalist id={listId}>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </datalist>
      </div>
    );
  }
);
Combobox.displayName = 'Combobox';

/* ─────────────────────────────────────────────────────────────────────────── */
/* Toggles                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(({ label, className, id, ...props }, ref) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
    <label htmlFor={inputId} className={cn('inline-flex items-center gap-2 cursor-pointer select-none', className)}>
      <div className="relative">
        <input ref={ref} id={inputId} type="checkbox" className="peer sr-only" {...props} />
        <div
          className={cn(
            'w-9 h-5 rounded-full border border-border bg-black/[0.06] dark:bg-white/[0.08]',
            'transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
            'peer-checked:bg-accent peer-checked:border-accent'
          )}
        />
        <div
          className={cn(
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-surface shadow-sm',
            'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
            'peer-checked:translate-x-4'
          )}
        />
      </div>
      {label && <span className="text-sm text-text-secondary">{label}</span>}
    </label>
  );
});
Switch.displayName = 'Switch';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, id, indeterminate, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    React.useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = Boolean(indeterminate);
      }
    }, [indeterminate]);

    return (
      <label htmlFor={inputId} className={cn('inline-flex items-center gap-2 cursor-pointer select-none', className)}>
        <div className="relative flex items-center justify-center">
          <input ref={innerRef} id={inputId} type="checkbox" className="peer sr-only" {...props} />
          <div
            className={cn(
              'w-4 h-4 rounded-[var(--radius-sm)] border border-border bg-black/[0.03] dark:bg-white/[0.04]',
              'transition-colors duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]',
              'peer-checked:bg-accent peer-checked:border-accent'
            )}
          />
          <svg
            className="absolute w-3 h-3 text-accent-ink opacity-0 peer-checked:opacity-100 transition-opacity duration-200"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        </div>
        {label && <span className="text-sm text-text-secondary">{label}</span>}
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';

/* ─────────────────────────────────────────────────────────────────────────── */
/* Feedback                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

interface AlertProps {
  severity?: 'error' | 'info';
  children: React.ReactNode;
  className?: string;
}

export function Alert({ severity = 'info', children, className }: AlertProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-body border',
        severity === 'error'
          ? 'bg-danger/10 border-danger/20 text-danger'
          : 'bg-info/10 border-info/20 text-info',
        className
      )}
    >
      <span className="mt-0.5">
        {severity === 'error' ? (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        )}
      </span>
      {children}
    </div>
  );
}

interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: 'default' | 'error' | 'warning' | 'success';
}

export function Chip({ children, className, color = 'default', ...props }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] font-mono font-medium border',
        color === 'default' && 'bg-black/[0.04] dark:bg-white/[0.06] border-border text-text-secondary',
        color === 'success' && 'bg-accent/15 border-accent/25 text-accent-ink dark:text-accent',
        color === 'warning' && 'bg-warning/15 border-warning/25 text-warning',
        color === 'error' && 'bg-danger/15 border-danger/25 text-danger',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Dialog                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 kd-glass bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="kd-rise kd-shell w-full max-w-2xl max-h-[82vh] flex flex-col shadow-2xl">
        <div className="kd-core flex flex-col max-h-full">
          <div className="flex-shrink-0 px-5 py-3 border-b border-border flex items-center justify-between gap-3">
            <h2 className="font-display font-semibold text-lg truncate pr-4">{title}</h2>
            <IconButton label="close" onClick={onClose}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </IconButton>
          </div>
          <div className="flex-1 overflow-auto p-5 min-h-0">{children}</div>
          {actions && <div className="flex-shrink-0 px-5 py-3 border-t border-border flex justify-end gap-2">{actions}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Tooltip (simple hover)                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

export function Tooltip({ title, children }: { title: string; children: React.ReactElement }) {
  const [show, setShow] = useState(false);
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 rounded-[var(--radius-sm)] text-[11px] font-mono whitespace-nowrap bg-surface border border-border shadow-lg z-50 pointer-events-none">
          {title}
          <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-surface" />
        </div>
      )}
    </div>
  );
}
