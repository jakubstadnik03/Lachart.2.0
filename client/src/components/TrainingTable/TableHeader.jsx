export function TableHeader() {
    const headers = ["Training", "Sport", "Date", "Avg pace"];
    
    return headers.map((header) => (
      <div key={header} className="flex flex-col flex-1 shrink justify-center self-stretch my-auto basis-0">
        <div className="flex gap-2.5 items-center py-2.5 pr-4 pl-5 w-full font-medium text-gray-900 whitespace-nowrap bg-white border-t border-b border-gray-200 max-sm:px-2">
          <div className="gap-1 self-stretch my-auto">{header}</div>
        </div>
      </div>
    ));
  }