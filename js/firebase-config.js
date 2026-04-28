// RSRC Dashboard – Firebase Configuration
const firebaseConfig = {
  apiKey:            "AIzaSyBrMd7h2itllDGDfQNRH2t-WFlRO7Lfj2k",
  authDomain:        "ste-bestuur-291c3.firebaseapp.com",
  projectId:         "ste-bestuur-291c3",
  storageBucket:     "ste-bestuur-291c3.firebasestorage.app",
  messagingSenderId: "764691111790",
  appId:             "1:764691111790:web:963a4982d67144df422b7f"
};

firebase.initializeApp(firebaseConfig);

// Firestore instance – shared by all pages via window.db
const db = firebase.firestore();