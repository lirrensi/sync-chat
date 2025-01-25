import "./AttachmentCard.css";
import { CircularProgressbar } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import {
    IonContent,
    IonHeader,
    IonPage,
    IonTitle,
    IonToolbar,
    IonIcon,
    IonButtons,
    IonTextarea,
    IonBackButton,
    useIonActionSheet,
    IonFooter,
    IonInput,
    IonButton,
    IonRefresher,
    IonRefresherContent,
    RefresherEventDetail,
    useIonToast,
} from "@ionic/react";
import { useState, createRef, useEffect, useRef } from "react";
import { cogOutline, send, attach, close as iconClose, documentAttach, arrowDown } from "ionicons/icons";
import { useIonRouter } from "@ionic/react";

import AutoGrowInput from "../components/AutoGrowInput";

import { promptFileBasic, existingFileDownload } from "../common/helpers/files";

import { proxy, useSnapshot } from "valtio";
import { store, fileStorage } from "../common/store";

import { displayDate, wait, truncateWithEllipsis } from "../common/helpers/ui";
import bytes from "bytes";
import { Attachment } from "../common/types";
import { MAX_FILE_TO_LOAD_INSTANT } from "../common/constants";

interface ContainerProps {}

const AttachmentCard: React.FC<any> = ({ attachment }) => {
    const [isVisible, setIsVisible] = useState(false);
    const visibleRef = useRef(null);
    // visibility observer...
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                // If the element is in viewport and its visibility ratio is greater than 0
                if (entry.isIntersecting && entry.intersectionRatio > 0) {
                    // Element is visible
                    setIsVisible(true);
                    // Timeout to ensure it stays visible for at least 1 second
                    const timeout = setTimeout(() => {
                        // Your function to be executed when the component is visible for 1 second
                        console.log("Component is visible for at least 1 second");
                        runWhenVisible();
                    }, 1000);

                    return () => clearTimeout(timeout);
                } else {
                    // Element is not visible
                    setIsVisible(false);
                }
            },
            { threshold: 0.5 } // Intersection threshold
        );

        if (visibleRef.current) {
            observer.observe(visibleRef.current);
        }

        return () => {
            if (visibleRef.current) {
                observer.unobserve(visibleRef.current);
            }
        };
    }, []);

    const [isLoaded, setIsLoaded] = useState(false);
    const [isBeingLoaded, setIsBeingLoaded] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);

    let didRunVisible = false;
    const runWhenVisible = async () => {
        if (didRunVisible) return;
        const loaded = await store.entityFiles.checkFileExists(attachment);
        if (loaded) {
            setIsLoaded(loaded);
        } else {
            const isSmallEnough = attachment.size < MAX_FILE_TO_LOAD_INSTANT;
            if (isSmallEnough) {
                await fileRemoteLoad(attachment, false);
            }
        }
        didRunVisible = true;
    };

    const size = bytes(attachment.size);

    // function run on click when file is requested to be loaded...
    // TODO: lock multiple clicks for files...
    const manualDownloadFile = async (attachment: Attachment) => {
        if (isLoaded) {
            if (confirm(`Download? ${attachment.name} ${size}`)) {
                existingFileDownload(attachment);
            }
        } else {
            await fileRemoteLoad(attachment, true);
            if (isLoaded) {
                existingFileDownload(attachment);
            }
        }
    };
    // general function to load any file;
    const fileRemoteLoad = async (attachment: Attachment, wasClicked: boolean) => {
        console.log("file remote load started => ...");
        setIsBeingLoaded(true);
        setLoadingProgress(0);

        await wait(1000);

        let remoteDownloadResult = "";
        if (attachment.size > MAX_FILE_TO_LOAD_INSTANT) {
            console.warn("starting to load streaming file...");
            remoteDownloadResult = await store.entityFiles.getRemoteFileStream(attachment, (float: number) => {
                console.log("file remote load progress => ...", float);
                setLoadingProgress(float * 100);
            });
        } else {
            console.warn("starting to load regular file...");
            remoteDownloadResult = await store.entityFiles.getRemoteFile(attachment, (float: number) => {
                console.log("file remote load progress => ...", float);
                setLoadingProgress(float * 100);
            });
        }
        if (remoteDownloadResult === "done") {
            setIsLoaded(true);
        }
        setIsBeingLoaded(false);
        // TODO: if click => propagate errors into toasts;
    };

    return (
        <div ref={visibleRef} className="entry-attachment entry-attachment-row">
            <div
                className="entry-attachment-image"
                style={{ background: "#7f5fda" }}
                onClick={() => manualDownloadFile(attachment)}
            >
                {/* <img src="https://ionicframework.com/docs/img/demos/avatar.svg"></img> */}
                {isLoaded && (
                    <div>
                        <IonIcon icon={documentAttach}></IonIcon>
                    </div>
                )}
                {!isLoaded && !isBeingLoaded && (
                    <div>
                        <IonIcon icon={arrowDown}></IonIcon>
                    </div>
                )}
                {!isLoaded && isBeingLoaded && (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "10px" }}>
                        <CircularProgressbar value={loadingProgress} />
                    </div>
                )}
            </div>
            <div className="entry-attachment-detail">
                <div className="entry-message-main-text single-line-text">
                    {truncateWithEllipsis(attachment.name, 32)}
                </div>
                <div className="entry-attachment-size">{size}</div>
                <div className="entry-message-sub-text">{displayDate(attachment.created_at)}</div>
            </div>
        </div>
    );
};

export default AttachmentCard;
