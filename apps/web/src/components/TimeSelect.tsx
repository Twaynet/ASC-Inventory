'use client';

interface TimeSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Start hour (0-23), defaults to 0 */
  startHour?: number;
  /** End hour (0-23), defaults to 23 */
  endHour?: number;
  className?: string;
}

/**
 * A consistent time selector component with 24-hour format and 15-minute intervals.
 * Used for scheduling cases, appointments, and other time-based inputs.
 */
export function TimeSelect({
  id,
  value,
  onChange,
  placeholder = 'Select time',
  required = false,
  disabled = false,
  startHour = 0,
  endHour = 23,
  className,
}: TimeSelectProps) {
  // Generate time options in 15-minute intervals
  const timeOptions: string[] = [];
  for (let hour = startHour; hour <= endHour; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const timeValue = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      timeOptions.push(timeValue);
    }
  }

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
      className={className}
    >
      <option value="">{placeholder}</option>
      {timeOptions.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
  );
}
