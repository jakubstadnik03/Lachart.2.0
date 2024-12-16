export function TrainingRow({ training, sport, date, averagePace, status }) {
    const getStatusIcon = (status) => {
      const icons = {
        up: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/ca42b61d339a69e3bb2cc02efb61369c67cfc2f39658e99e5d576df14fcdfcd9?apiKey=069fe6e63e3c490cb6056c51644919ef&",
        down: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/03f5e1c239b86d526fe7a81e7008e0b47bb861a21531b26f903e6750497c90ce?apiKey=069fe6e63e3c490cb6056c51644919ef&",
        same: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/5624a86d3c88d3562872dd0f15221eca4dabce973c1983cf98dd06cde908b9ee?apiKey=069fe6e63e3c490cb6056c51644919ef&"
      };
      return icons[status];
    };
  
    const getBackgroundColor = (status) => {
      const colors = {
        up: "bg-green-600 text-green-600 bg-opacity-10",
        down: "bg-red-600 text-red-600 bg-opacity-10",
        same: "bg-gray-200 text-gray-600"
      };
      return colors[status];
    };
    
  
    return (
      <>
        <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto basis-0">
          <div className="self-stretch py-2.5 pr-4 pl-5 w-full border-b border-gray-200 max-sm:px-2 max-sm:text-xs">
            {training}
          </div>
        </div>
        <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto whitespace-nowrap basis-0">
          <div className="self-stretch px-4 py-2.5 w-full border-b border-gray-200">
            {sport.substring(0, 4)}
          </div>
        </div>
        <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto basis-0">
          <div className="self-stretch px-4 py-2.5 w-full border-b border-gray-200">
            {date.split(" ").join(".")}
          </div>
        </div>
        <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto text-sm text-green-600 basis-0">
          <div className="flex justify-center items-center py-2 w-full text-center border-b border-gray-200">
            <div
              className={`flex gap-1 items-center self-stretch p-1 my-auto rounded-md ${getBackgroundColor(
                status
              )}`}
            >
              <img
                loading="lazy"
                src={getStatusIcon(status)}
                alt=""
                className="object-contain shrink-0 self-stretch my-auto w-3 aspect-square"
              />
              <div className="self-stretch my-auto">{averagePace}</div>
            </div>
          </div>
        </div>
      </>
    );
  }
  