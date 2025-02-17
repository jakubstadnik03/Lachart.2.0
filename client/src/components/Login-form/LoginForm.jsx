import React from "react";
import FormField from "./FormField";
import SelectField from "./SelectField";
import TextArea from "./TextArea";
import Button from "./Button";

const LoginForm = () => {
  const formFields = [
    { label: "Name", type: "text", placeholder: "Enter name", required: true },
    { label: "Surname", type: "text", placeholder: "Enter Surname", required: true },
    { label: "Date of Birth", type: "date", placeholder: "DD/MM/YY", required: true },
    { label: "Email", type: "email", placeholder: "Enter email address", required: true },
    { label: "Phone", type: "tel", placeholder: "Enter phone number", required: true },
    { label: "Address", type: "text", placeholder: "Enter your address" },
    { label: "Weight", type: "text", placeholder: "Enter weight" },
    { label: "Height", type: "text", placeholder: "Enter height" },
  ];

  return (
    <div className="flex flex-col justify-center bg-white rounded-3xl max-w-[632px]">
      <div className="flex flex-col w-full max-md:max-w-full">
        <div className="flex flex-col justify-center py-4 pr-4 pl-6 w-full text-xl font-semibold text-gray-900 border-b border-gray-200 max-md:pl-5 max-md:max-w-full">
          <div className="flex flex-wrap items-center max-w-full w-[592px]">
            <div className="flex-1 shrink self-stretch my-auto basis-0 max-md:max-w-full">
              Login Form
            </div>
            <img
              loading="lazy"
              src="https://cdn.builder.io/api/v1/image/assets/TEMP/7ea370932f7d95660d07caaa51c242f44d98df969a05243024e7df3fcc12d4d6?placeholderIfAbsent=true&apiKey=f26ef201ae1f4d94a4c50b4406b07044"
              className="object-contain shrink-0 self-stretch my-auto w-6 aspect-square"
              alt=""
            />
          </div>
        </div>
        <div className="flex flex-col px-5 mt-4 w-full min-h-[694px] max-md:max-w-full">
          <div className="flex flex-wrap gap-10 justify-between items-start w-full max-md:max-w-full">
            <div className="flex flex-col text-sm font-semibold text-gray-900 w-[150px]">
              <div>Profile Image</div>
              <img
                loading="lazy"
                src="https://cdn.builder.io/api/v1/image/assets/TEMP/5ce00981d989a8c861f75293169cd8659560abfee154db4157083d63c330b071?placeholderIfAbsent=true&apiKey=f26ef201ae1f4d94a4c50b4406b07044"
                className="object-contain mt-4 max-w-full aspect-[0.94] rounded-[96px] w-[150px]"
                alt="Profile"
              />
            </div>
            <div className="flex flex-col min-w-[240px] w-[299px]">
              {formFields.slice(0, 3).map((field, index) => (
                <FormField key={index} {...field} />
              ))}
            </div>
          </div>
          <div className="flex flex-col self-center mt-2.5 w-full text-sm max-w-[592px] max-md:max-w-full">
            {formFields.slice(3).map((field, index) => (
              <FormField key={index} {...field} />
            ))}
            <SelectField
              label="Sports"
              placeholder="Select sports"
            />
            <TextArea
              label="Notes"
              placeholder="Write notes..."
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 justify-center items-center pb-5 mt-4 w-full text-base font-semibold whitespace-nowrap max-md:max-w-full">
        <Button variant="outline" text="Cancel" />
        <Button variant="primary" text="Save" />
      </div>
    </div>
  );
};

export default LoginForm;