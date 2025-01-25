import React, { useState, useRef, useEffect } from "react";
import { IonButtons, IonButton, IonModal, IonHeader, IonContent, IonToolbar, IonTitle, IonPage } from "@ionic/react";

// @ts-ignore
import QRious from "qrious";

const QRCodePresenter: React.FC = ({ isOpen, setIsOpen, qrCodeString }: any) => {
    useEffect(() => {
        console.log("QRCodePresenter/qrCodeString", qrCodeString);
        setTimeout(() => {
            const qrcode = new QRious({
                element: document.querySelector("#qrcode-present canvas"),
                value: qrCodeString, // URL or any text you want to encode
                size: Math.floor(window.innerWidth * 0.95), // Size of the QR code (width and height)
            });
        }, 10);
    }, [isOpen]);

    return (
        <IonModal isOpen={isOpen}>
            <IonHeader>
                <IonToolbar>
                    <IonTitle>Add device</IonTitle>
                    <IonButtons slot="end">
                        <IonButton onClick={() => setIsOpen(false)}>Close</IonButton>
                    </IonButtons>
                </IonToolbar>
            </IonHeader>
            <IonContent className="ion-padding">
                <div id="qrcode-present">
                    <canvas></canvas>
                </div>
            </IonContent>
        </IonModal>
    );
};

export default QRCodePresenter;
