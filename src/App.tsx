import { useEffect } from "react";
import { Redirect, Route } from "react-router-dom";
import { IonApp, IonRouterOutlet, setupIonicReact, useIonRouter } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { proxy, useSnapshot } from "valtio";

import Home from "./pages/Home";
import Settings from "./pages/Settings";

import ChatList from "./pages/ChatList";
import ChatView from "./pages/ChatView";

import FileList from "./pages/FileList";

import NoteList from "./pages/NoteList";
import NoteView from "./pages/NoteView";

/* Core CSS required for Ionic components to work properly */
import "@ionic/react/css/core.css";

/* Basic CSS for apps built with Ionic */
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";

/* Optional CSS utils that can be commented out */
import "@ionic/react/css/padding.css";
import "@ionic/react/css/float-elements.css";
import "@ionic/react/css/text-alignment.css";
import "@ionic/react/css/text-transformation.css";
import "@ionic/react/css/flex-utils.css";
import "@ionic/react/css/display.css";

/* Theme variables */
import "./theme/variables.css";
/* custom override css */
import "./theme/custom.css";

// store where all state management done
import store from "./common/store";
store.init.initSavedState();

setupIonicReact();

const App: React.FC = () => {
    const state = useSnapshot(store);
    const router = useIonRouter();

    const basePath = "";

    // basename={"/bobr/"}
    return (
        <IonApp>
            <IonReactRouter basename={"/bobr/"}>
                <IonRouterOutlet>
                    <Route path={"/"} render={() => <Redirect to={"/home"} />} exact />

                    <Route path="/home" component={Home} exact />
                    <Route path="/home/chats" component={ChatList} exact />
                    <Route path="/home/chats/:chat_id" component={ChatView} exact />

                    <Route path="/home/files" component={FileList} exact />

                    <Route path="/home/notes" component={NoteList} exact />
                    <Route path="/home/notes/:note_id" component={NoteView} exact />

                    <Route path="/settings" component={Settings} exact />
                </IonRouterOutlet>
            </IonReactRouter>
        </IonApp>
    );
};

export default App;
