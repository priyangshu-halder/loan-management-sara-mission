import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, id, required, disabled, children, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/[^a-z0-9]/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-semibold text-slate-800">
            {label}
            {required && <span className="text-red-600 ml-1 font-bold">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            required={required}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={error ? `${selectId}-error` : undefined}
            className={twMerge(
              clsx(
                "w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 transition-colors shadow-sm",
                "border-slate-300 hover:border-slate-400 cursor-pointer",
                "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white",
                "disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed disabled:shadow-none",
                "[&>option]:bg-white [&>option]:text-slate-900 [&>option]:py-1",
                error &&
                  "border-red-500 hover:border-red-600 focus:border-red-600 focus:ring-red-500/20",
                className
              )
            )}
            {...props}
          >
            {children}
          </select>
        </div>
        {error && (
          <p id={`${selectId}-error`} className="text-xs text-red-600 font-medium">
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

Select.displayName = "Select";
