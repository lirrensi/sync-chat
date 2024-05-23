import React, { useRef, useEffect } from "react";
import { IonInput } from "@ionic/react";

const AutoGrowInput = ({ value, onChange, placeholder, ...rest }: any) => {
    const inputRef = useRef(null);

    useEffect(() => {
        adjustHeight();
    }, [value]);

    const adjustHeight = () => {
        if (inputRef.current) {
            inputRef.current.style.height = "auto";
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    };

    const handleChange = (e: any) => {
        if (onChange) {
            onChange(e);
        }
        adjustHeight();
    };

    return <IonInput ref={inputRef} value={value} onIonChange={handleChange} placeholder={placeholder} {...rest} />;
};

export default AutoGrowInput;
