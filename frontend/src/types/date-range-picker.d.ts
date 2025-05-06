declare module '@/components/ui/date-range-picker' {
  import { DateRange } from 'react-day-picker';
  
  export interface DatePickerWithRangeProps {
    className?: string;
    date: DateRange | undefined;
    setDate: (date: DateRange | undefined) => void;
  }
  
  export function DatePickerWithRange(props: DatePickerWithRangeProps): JSX.Element;
}
