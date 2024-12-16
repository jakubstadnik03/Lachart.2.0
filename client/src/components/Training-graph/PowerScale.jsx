interface ScaleProps {
    values: string[];
    unit: string;
  }
  
  export function Scale({ values, unit }: ScaleProps) {
    return (
      <div className="flex flex-col justify-between py-4 w-12 text-sm text-right whitespace-nowrap min-h-[287px] text-zinc-500">
        {values.map((value, index) => (
          <div key={index} className={index > 0 ? "mt-4" : ""}>
            {value}{unit}
          </div>
        ))}
      </div>
    );
  }