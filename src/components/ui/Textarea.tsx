import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, required, disabled, readOnly, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/[^a-z0-9]/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-semibold text-slate-800">
            {label}
            {required && <span className="text-red-600 ml-1 font-bold">*</span>}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={!!error}
          aria-describedby={error ? `${textareaId}-error` : undefined}
          className={twMerge(
            clsx(
              "w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 transition-colors shadow-sm",
              "border-slate-300 hover:border-slate-400 placeholder:text-slate-500",
              "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white",
              disabled &&
                "bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed hover:border-slate-200 shadow-none",
              readOnly && !disabled && "bg-slate-50 text-slate-700 border-slate-300",
              error &&
                "border-red-500 hover:border-red-600 focus:border-red-600 focus:ring-red-500/20",
              className
            )
          )}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="text-xs text-red-600 font-medium">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-xs text-slate-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
