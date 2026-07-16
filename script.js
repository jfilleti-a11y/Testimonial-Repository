 import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js';
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
        import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged }
        from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
        import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, orderBy, doc, getDoc, updateDoc, deleteDoc }
        from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";









        // Replace the old generateAISummary block with this optimized script
        // Updated client-side analyzer with automatic retry handling for 503/429 errors
async function generateAIAnalysis(transcript, apiKeyPassedIn) {
    if (!transcript || transcript.trim() === "") return { summary: "", tags: "" };

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";
    const prompt = `You are an expert executive assistant and corporate taxonomy master. Analyze the following testimonial transcript and generate two distinct metadata assets: an "AI Summary Card" and a list of up to 12 relevant lowercase categorization keywords.

Format your entire response output layout strictly into these two sections, separated by a triple pipe delimiter line "|||" exactly like this:

CHALLENGE: [1-2 sentences explaining the core business problem or software inefficiencies faced before using the product]

SOLUTION: [1-2 sentences detailing specific features, tools, or service plans implemented to solve the problem]

RESULTS & IMPACT: [1-2 sentences highlighting metrics, time savings, or emotional relief experienced]
|||
tag1, tag2, tag3, tag4, tag5

CRITICAL RULES:
1. Do NOT use markdown bolding or any asterisks (absolutely no **).
2. Do NOT use nested bullet points, dashed list hyphens, or numbering structures.
3. The tags segment must be a single line of lowercase, comma-separated keywords.
4. The tags must avoid using the product name: "Wave"
5. Provide raw string data only. Do not wrap the response inside conversational introduction or conclusion filler greetings.

Transcript:
${transcript}`;

    const maxRetries = 3;
    let delay = 1000; // Start with a 1-second delay

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKeyPassedIn
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                })
            });

            // If Gemini returns a 503 (Busy) or 429 (Rate Limit), pause and try again
            if ((response.status === 503 || response.status === 429) && attempt < maxRetries) {
                console.warn(`Gemini API reported status ${response.status}. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponentially back off (1s -> 2s -> 4s)
                continue;
            }

            if (!response.ok) throw new Error(`API Gateway error: ${response.statusText}`);

            const data = await response.json();
            const rawOutput = data.candidates[0].content.parts[0].text.trim();

            const pieces = rawOutput.split('|||');
            const summary = pieces[0] ? pieces[0].trim() : "Summary generation skipped.";
            const tags = pieces[1] ? pieces[1].trim() : "";

            return { summary, tags };
        } catch (error) {
            if (attempt === maxRetries) {
                console.error("Gemini AI integration processing exception after retries:", error);
                return { summary: "AI Evaluation failed due to temporary server capacity limits.", tags: "" };
            }
            // Fallback delay for network dropouts
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
}



       // Global memory variables to briefly store our staged data fragments local to this modal view
        let stagedSummaryText = "";
        let stagedTagsText = "";

        // Helper function to check if both suggestions have been handled, closing the container automatically
        function checkStagingCompletion() {
            const summaryRow = document.getElementById('staged-summary-row');
            const tagsRow = document.getElementById('staged-tags-row');
            const stagingArea = document.getElementById('ai-staging-area');

            // If both individual rows are hidden, shut the master container!
            if (summaryRow.style.display === "none" && tagsRow.style.display === "none") {
                stagingArea.style.display = "none";
            }
        }

        document.getElementById('regenerate-ai-btn').addEventListener('click', async () => {
            const transcriptText = document.getElementById('edit-transcript').value;
            const genStatus = document.getElementById('ai-generation-status');
            const genBtn = document.getElementById('regenerate-ai-btn');
            const stagingArea = document.getElementById('ai-staging-area');

            if (!transcriptText || transcriptText.trim() === "") {
                genStatus.innerText = "Error: Please provide a transcript first.";
                genStatus.style.color = "var(--clr-danger)";
                return;
            }

            genBtn.disabled = true;
            genStatus.innerHTML = `<div class="loading-spinner"></div> Loading secure credentials...`;
            genStatus.style.color = "var(--clr-text-main)";
            stagingArea.style.display = "none"; // Reset panel view visibility state

            try {
                const configRef = doc(db, 'config', 'geminiAPI');
                const configSnap = await getDoc(configRef);

                if (!configSnap.exists()) {
                    throw new Error("Secure API credential mapping key definition row missing inside Firestore.");
                }

                const SECURE_GEMINI_KEY = configSnap.data().key;
                genStatus.innerHTML = `<div class="loading-spinner"></div> Using AI to summarize transcript ...`;

                // Run the optimized 2-for-1 backend query
                const aiPayload = await generateAIAnalysis(transcriptText, SECURE_GEMINI_KEY);

                // Store responses inside local memory variables
                stagedSummaryText = aiPayload.summary;
                stagedTagsText = aiPayload.tags;

                // Populate our hidden staging visual fields
                document.getElementById('staged-summary-text').innerText = stagedSummaryText;
                document.getElementById('staged-tags-text').innerText = stagedTagsText;

                // CRITICAL: Reset row visibility states back to visible for a fresh analysis run
                document.getElementById('staged-summary-row').style.display = "block";
                document.getElementById('staged-tags-row').style.display = "block";

                // Reveal the staging dashboard container block smoothly
                genStatus.innerText = "Analysis compiled below!";
                genStatus.style.color = "var(--clr-success)";
                stagingArea.style.display = "block";

                // Auto-scroll within the scrollable modal container
                stagingArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            } catch (error) {
                console.error(error);
                genStatus.innerText = "Analysis compilation failure details: " + error.message;
                genStatus.style.color = "var(--clr-danger)";
            } finally {
                genBtn.disabled = false;
                setTimeout(() => { genStatus.innerHTML = ""; }, 4000);
            }
        });

        // --- Drag-and-Drop for Transcript File ---
        const transcriptTextArea = document.getElementById('transcript');

        // Add a visual indicator when a file is dragged over
        ['dragenter', 'dragover'].forEach(eventName => {
            transcriptTextArea.addEventListener(eventName, () => {
                transcriptTextArea.classList.add('drag-over');
            }, false);
        });

        // Remove the visual indicator
        ['dragleave', 'drop'].forEach(eventName => {
            transcriptTextArea.addEventListener(eventName, () => {
                transcriptTextArea.classList.remove('drag-over');
            }, false);
        });

        // Prevent the browser's default behavior for all drag events
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            transcriptTextArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        // Handle the file drop
        transcriptTextArea.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                // Check if the dropped file is a text file
                if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
                    const reader = new FileReader();
                    reader.onload = (readEvent) => {
                        transcriptTextArea.value = readEvent.target.result;
                    };
                    reader.readAsText(file);
                } else {
                    alert('Please drop a valid .txt file.');
                }
            }
        }, false);
        // --- NEW STAGING MANAGEMENT BUTTON CLICK ROUTERS ---

        // 1. Summary Actions Row Click Handlers
        document.getElementById('apply-summary-btn').addEventListener('click', () => {
            document.getElementById('edit-ai-summary').value = stagedSummaryText;
            document.getElementById('staged-summary-row').style.display = "none"; // Hide just the summary row
            checkStagingCompletion();
        });

        // --- Detail Page Search ---
        const detailSearchBar = document.getElementById('detail-search-bar');
        const detailClearSearchBtn = document.getElementById('detail-clear-search-btn');
        const detailSearchSubmitBtn = document.getElementById('detail-search-submit-btn');
        const noResultsMsg = document.getElementById('detail-search-no-results');
        const detailSearchNav = document.getElementById('detail-search-nav');
        const detailSearchCounter = document.getElementById('detail-search-counter');
        const detailSearchPrevBtn = document.getElementById('detail-search-prev-btn');
        const detailSearchNextBtn = document.getElementById('detail-search-next-btn');
        let currentTestimonialData = null;
        let currentHighlightIndex = -1;
        let highlightedElements = [];

        // Show/hide the clear button based on input, but don't search automatically
        detailSearchBar.addEventListener('input', (e) => {
            const query = e.target.value;
            detailClearSearchBtn.classList.toggle('visible', query.length > 0);
            // If user clears input, also hide the "no results" message
            if (!query) noResultsMsg.classList.add('hidden');
        });

        detailSearchPrevBtn.addEventListener('click', () => {
            if (highlightedElements.length === 0) return;
            highlightedElements[currentHighlightIndex].classList.remove('active-highlight');
            currentHighlightIndex = (currentHighlightIndex - 1 + highlightedElements.length) % highlightedElements.length;
            navigateToHighlight();
        });

        detailSearchNextBtn.addEventListener('click', () => {
            if (highlightedElements.length === 0) return;
            highlightedElements[currentHighlightIndex].classList.remove('active-highlight');
            currentHighlightIndex = (currentHighlightIndex + 1) % highlightedElements.length;
            navigateToHighlight();
        });

        function navigateToHighlight() {
            const targetElement = highlightedElements[currentHighlightIndex];
            highlightedElements.forEach(el => el.classList.remove('active-highlight'));
            targetElement.classList.add('active-highlight');
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            detailSearchCounter.textContent = `${currentHighlightIndex + 1} of ${highlightedElements.length}`;
        }
        // CHANGE THIS:
        function triggerDetailSearch() {
            // Stop deleting the global 'q' parameter here!
            // This ensures going back still remembers what you searched on the home page.
            performDetailSearch(detailSearchBar.value);
        }

        detailSearchSubmitBtn.addEventListener('click', triggerDetailSearch);
        detailSearchBar.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent any default form submission
                triggerDetailSearch();
            }
        });

        detailClearSearchBtn.addEventListener('click', () => {
            detailSearchBar.value = '';
            detailClearSearchBtn.classList.remove('visible');
            noResultsMsg.classList.add('hidden');
            // Clears local highlights, but leaves the URL's 'q' alone!
            performDetailSearch('');
        });

        function performDetailSearch(query) {
            if (!currentTestimonialData) return;

            noResultsMsg.classList.add('hidden'); // Always hide message before a new search

            const detailContent = document.getElementById('detail-content');
            const pullQuoteEl = detailContent.querySelector('.pull-quote');
            const notesBodyEl = detailContent.querySelector('.notes-body');
            const transcriptBodyEl = detailContent.querySelector('.transcript-body');
            // Target the tag buttons inside the detail view
            const tagButtons = detailContent.querySelectorAll('.tags-box .clickable-tag');

            // Reset content to original before applying new highlights
            if (pullQuoteEl) pullQuoteEl.innerHTML = `"${currentTestimonialData.pullQuote}"`;
            if (notesBodyEl && currentTestimonialData.additionalNotes) notesBodyEl.innerHTML = currentTestimonialData.additionalNotes;
            if (transcriptBodyEl && currentTestimonialData.transcript) transcriptBodyEl.innerHTML = currentTestimonialData.transcript;

            // Reset tag buttons to their original text state
            tagButtons.forEach(btn => {
                const originalTagText = btn.getAttribute('data-tag');
                if (originalTagText) btn.innerHTML = originalTagText;
            });

            // Clear previous highlights and state
            highlightedElements = [];
            currentHighlightIndex = -1;
            detailSearchNav.classList.add('hidden');

            const cleanQuery = query.trim();
            if (!cleanQuery) return; // Exit if search is empty

            // Apply new highlights to text fields
            if (pullQuoteEl) pullQuoteEl.innerHTML = highlightText(pullQuoteEl.innerHTML, cleanQuery);
            if (notesBodyEl) notesBodyEl.innerHTML = highlightText(notesBodyEl.innerHTML, cleanQuery);
            if (transcriptBodyEl) transcriptBodyEl.innerHTML = highlightText(transcriptBodyEl.innerHTML, cleanQuery);

            // Apply highlights to matching tag text fields
            tagButtons.forEach(btn => {
                const originalTagText = btn.getAttribute('data-tag');
                if (originalTagText) btn.innerHTML = highlightText(originalTagText, cleanQuery);
            });

            highlightedElements = Array.from(detailContent.querySelectorAll('mark'));

            if (highlightedElements.length > 0) {
                currentHighlightIndex = 0;
                detailSearchNav.classList.remove('hidden');
                detailSearchPrevBtn.disabled = highlightedElements.length <= 1;
                detailSearchNextBtn.disabled = highlightedElements.length <= 1;
                navigateToHighlight();
            } else {
                noResultsMsg.classList.remove('hidden');
            }
        }
        document.getElementById('dismiss-summary-btn').addEventListener('click', () => {
            document.getElementById('staged-summary-row').style.display = "none"; // Hide just the summary row
            checkStagingCompletion();
        });

        // 2. Tags Actions Row Click Handlers
        document.getElementById('apply-tags-btn').addEventListener('click', () => {
            const existingTagsInput = document.getElementById('edit-tags').value.trim();
            if (existingTagsInput) {
                // Safe programmatic tag appending strategy while preserving structural comma rules
                document.getElementById('edit-tags').value = `${existingTagsInput}, ${stagedTagsText}`;
            } else {
                document.getElementById('edit-tags').value = stagedTagsText;
            }
            document.getElementById('staged-tags-row').style.display = "none"; // Hide just the tags row
            checkStagingCompletion();
        });

        document.getElementById('dismiss-tags-btn').addEventListener('click', () => {
            document.getElementById('staged-tags-row').style.display = "none"; // Hide just the tags row
            checkStagingCompletion();
        });


        // Firebase Config
        const firebaseConfig = {
          apiKey: "AIzaSyDNiri7_fQfAF-gOSEBvyfS4v9ZnoJ1O1w",
          authDomain: "wave-testimonials.firebaseapp.com",
          projectId: "wave-testimonials",
          storageBucket: "wave-testimonials.firebasestorage.app",
          messagingSenderId: "752388326563",
          appId: "1:752388326563:web:7371a254409949dda46b16",
          measurementId: "G-1PZTSKW015"
        };

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const provider = new GoogleAuthProvider();
        const db = getFirestore(app);

        // UI Elements
        const mainHeader = document.getElementById('main-header');
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const loginScreen = document.getElementById('login-screen');
        const repoScreen = document.getElementById('repo-screen');
        const detailScreen = document.getElementById('detail-screen');
        const errorMsg = document.getElementById('error-msg');
        const detailEditBtn = document.getElementById('detail-edit-btn');
        const detailDeleteBtn = document.getElementById('detail-delete-btn');
        const editModal = document.getElementById('edit-modal');
        const closeEditModalBtn = document.getElementById('close-edit-modal-btn');
        const deleteModal = document.getElementById('delete-modal');
        const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
        const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
        const userAvatar = document.getElementById('user-avatar');
        const userInfo = document.getElementById('user-info');
        const userMenuDropdown = document.getElementById('user-menu-dropdown');
        const userName = document.getElementById('user-name');
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        const adminContactModal = document.getElementById('admin-contact-modal');
        const closeAdminContactModalBtn = document.getElementById('close-admin-contact-modal-btn');
        const adminEmailList = document.getElementById('admin-email-list');
        const rootLinksToggleBtn = document.getElementById('root-links-toggle-btn');
        const rootLinksContainer = document.getElementById('root-links-container');
        const logoLink = document.getElementById('logo-link');

        // --- Admin & Security ---
        const ADMIN_EMAILS = ['jfilleti@waveapps.com']; // Add admin emails here
        let currentUserIsAdmin = false;

        // Layout Functions
        function setHeaderLarge() {
            mainHeader.classList.add('header-large');
        }
        function setHeaderSmall() {
            mainHeader.classList.add('header-large');
        }

        // Dark Mode Logic
        function applyTheme(theme) {
            if (theme === 'dark') {
                document.body.classList.add('dark');
                themeToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg> Light Mode`;
            } else {
                document.body.classList.remove('dark');
                themeToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg> Dark Mode`;
            }
        }
        themeToggleBtn.addEventListener('click', () => {
            const newTheme = document.body.classList.contains('dark') ? 'light' : 'dark';
            localStorage.setItem('testimonial-theme', newTheme);
            applyTheme(newTheme);
        });
        applyTheme(localStorage.getItem('testimonial-theme') || 'light'); // Apply saved theme on load

        // Handle Login / Logout
        loginBtn.addEventListener('click', async () => {
            try { await signInWithPopup(auth, provider); }
            catch (error) { console.error("Login failed:", error); }
        });
        logoutBtn.addEventListener('click', () => signOut(auth));

        // User menu dropdown
        userInfo.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenuDropdown.classList.toggle('hidden');
            document.getElementById('user-menu-arrow').style.transform = userMenuDropdown.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        });

        rootLinksToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            rootLinksContainer.classList.toggle('open');
        });

        // Close dropdown if clicking outside
        window.addEventListener('click', (e) => {
            // User menu
            if (!userMenuDropdown.classList.contains('hidden') && !userInfo.contains(e.target) && !userMenuDropdown.contains(e.target)) {
                document.getElementById('user-menu-arrow').style.transform = 'rotate(0deg)';
                userMenuDropdown.classList.add('hidden');
            }

            // Root links menu
            if (rootLinksContainer.classList.contains('open') && !rootLinksToggleBtn.contains(e.target) && !rootLinksContainer.contains(e.target)) {
                rootLinksContainer.classList.remove('open');
            }
        });

        // Logo click to go home
        logoLink.addEventListener('click', (e) => {
            e.preventDefault();
            history.pushState(null, "Testimonial Repository", window.location.pathname);
            updateView();
        });

        // Remove underline from header link
        logoLink.style.textDecoration = 'none';
        logoLink.addEventListener('click', (e) => {
            e.preventDefault();
        });

        // Auth State
        onAuthStateChanged(auth, (user) => {
            if (user) {
                const email = user.email;
                if (email.endsWith('@waveapps.com') || email.endsWith('@hrblock.com')) {
                    loginScreen.classList.add('hidden');

                    // Check if the user is an admin
                    currentUserIsAdmin = ADMIN_EMAILS.includes(email);

                    mainHeader.classList.remove('hidden');
                    repoScreen.classList.remove('hidden');
                    detailScreen.classList.add('hidden');
                    editModal.classList.remove('active');
                    deleteModal.classList.remove('active');
                    errorMsg.innerText = "";
                    userAvatar.src = user.photoURL;
                    userAvatar.style.display = 'block';
                    userName.innerText = user.displayName;
                    loadTestimonials();
                    updateView();
                } else {
                    signOut(auth);
                    errorMsg.innerText = "Access restricted to Wave and H&R Block employees.";
                }
            } else {
                loginScreen.classList.remove('hidden');
                currentUserIsAdmin = false; // Reset admin status on logout

                mainHeader.classList.add('hidden');
                repoScreen.classList.add('hidden');
                detailScreen.classList.add('hidden');
                editModal.classList.remove('active');
                document.getElementById('user-menu-arrow').style.transform = 'rotate(0deg)';
                userMenuDropdown.classList.add('hidden');
                deleteModal.classList.remove('active');
            }
        });

        // Modal Logic
        const addModal = document.getElementById('add-modal');
        const openAddModalBtn = document.getElementById('open-add-modal-btn');
        const closeModalBtn = document.getElementById('close-modal-btn');
        const addForm = document.getElementById('add-testimonial-form');
        const uploadStatus = document.getElementById('upload-status');

        openAddModalBtn.addEventListener('click', () => {
            addModal.classList.add('active');
            uploadStatus.innerText = ""; // Clear old statuses
        });

        closeModalBtn.addEventListener('click', () => {
            addModal.classList.remove('active');
            addForm.reset();
        });

        // Close modal if clicking outside the content area
        addModal.addEventListener('click', (e) => {
            if (e.target === addModal) {
                addModal.classList.remove('active');
            }
        });








        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            uploadStatus.innerHTML = `<div class="loading-spinner"></div> Secure verification in progress...`;
            uploadStatus.style.color = "var(--clr-text-main)";

            try {
                const testimonialsCol = collection(db, 'testimonials');
                const rawManualTags = document.getElementById('tags').value.trim();
                const transcriptText = document.getElementById('transcript').value;

                let generatedSummary = "";
                let finalTagsArray = [];

                // Run background AI loop because transcript is verified mandatory
                uploadStatus.innerHTML = `<div class="loading-spinner"></div> Using AI to generate summary and tags...`;

                try {
                    const configRef = doc(db, 'config', 'geminiAPI');
                    const configSnap = await getDoc(configRef);
                    if (!configSnap.exists()) throw new Error("Database configuration API row pointer references missing.");
                    const SECURE_GEMINI_KEY = configSnap.data().key;

                    // Compute unified 2-for-1 parameters
                    const aiData = await generateAIAnalysis(transcriptText, SECURE_GEMINI_KEY);
                    generatedSummary = aiData.summary;

                    // Append or join logic loops depending on if manual inputs are present
                    let compiledTagsString = aiData.tags;
                    if (rawManualTags) {
                        compiledTagsString = `${rawManualTags}, ${aiData.tags}`;
                    }
                    finalTagsArray = compiledTagsString.split(',').map(tag => tag.trim()).filter(tag => tag !== "");

                } catch (aiError) {
                    console.error("Background AI generation bypassed due to quota context block:", aiError);
                    // Bulletproof backup plan: Write a friendly error message if you hit a daily 429 quota lock
                    generatedSummary = "AI Summary processing pending. (Daily request limit reached during profile generation. Open Edit modal to retry computing.)";
                    finalTagsArray = rawManualTags.split(',').map(tag => tag.trim()).filter(tag => tag !== "");
                }

                uploadStatus.innerHTML = `<div class="loading-spinner"></div> Writing document to cloud repository storage arrays...`;

                await addDoc(testimonialsCol, {
                    intervieweeName: document.getElementById('interviewee-name').value,
                    businessName: document.getElementById('business-name').value,
                    pullQuote: document.getElementById('pull-quote').value,
                    imageUrl: document.getElementById('image-url').value,
                    frameUrl: document.getElementById('frame-url').value,
                    driveUrl: document.getElementById('drive-url').value,
                    websiteVideoEditUrl: document.getElementById('website-video-edit-url').value,
                    additionalNotes: document.getElementById('additional-notes').value,
                    tags: finalTagsArray,
                    transcript: transcriptText,
                    aiSummary: generatedSummary,
                    createdAt: serverTimestamp(),
                    order: -Date.now()
                });

                uploadStatus.style.color = "var(--clr-success)";
                uploadStatus.innerText = "Success! Testimonial added with background AI metadata.";

                await loadTestimonials();
                setTimeout(() => {
                    addModal.classList.remove('active');
                    addForm.reset();
                }, 1500);

            } catch (error) {
                console.error("Fatal addition process loop breakdown failure context:", error);
                uploadStatus.innerText = "Error: " + error.message;
                uploadStatus.style.color = "var(--clr-danger)";
            }
        });





        // Grid & Search
        const gridContainer = document.getElementById('testimonial-grid');
        const searchBar = document.getElementById('search-bar');
        let allTestimonials = [];
        let allTags = new Set();
        let currentActiveId = null;

        async function loadTestimonials() {
            gridContainer.innerHTML = "<p>Loading testimonials...</p>";
            try {
                // Fetch all documents without a specific order from Firestore.
                // We will sort them on the client-side to handle missing 'order' fields.
                const q = query(collection(db, 'testimonials'));
                const querySnapshot = await getDocs(q);

                allTestimonials = [];
                querySnapshot.forEach((doc) => {
                    allTestimonials.push({ id: doc.id, ...doc.data() });
                });

                // Extract all unique tags for suggestions
                allTags.clear();
                allTestimonials.forEach(item => item.tags?.forEach(tag => allTags.add(tag)));


                // Sort the testimonials in the browser.
                // Items with an 'order' field will be sorted by it.
                // Items without an 'order' field will be treated as having an infinite order value,
                // placing them at the end of the list.
                allTestimonials.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
                renderGrid(allTestimonials, true); // Animate on initial load

                initializeDragAndDrop(); // Initialize SortableJS after rendering
            } catch (error) {
                console.error("Error loading testimonials:", error);
                gridContainer.innerHTML = "<p style='color:red;'>Failed to load database.</p>";
            }
        }

        function renderGrid(dataArray, withAnimation = false) {
            gridContainer.innerHTML = "";

            if (dataArray.length === 0) {
                gridContainer.innerHTML = "<p>No matching testimonials found.</p>";
                return;
            }

            dataArray.forEach((data, index) => {
                const card = document.createElement('div');
                card.className = 'card';
                card.dataset.id = data.id; // Add data-id for SortableJS
                const displayImg = data.imageUrl || 'https://placehold.co/600x400/e5e7eb/a3a8b8?text=No+Image';

                const videoIconHtml = data.websiteVideoEditUrl ? `
                    <div class="video-indicator-icon" title="Has Website Video Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
                    </div>
                ` : '';

                card.innerHTML = `
                    ${videoIconHtml}
                    <div class="card-hover-actions">
                        <button class="card-hover-btn edit" data-id="${data.id}" title="Edit Testimonial">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        </button>
                        <button class="card-hover-btn delete" data-id="${data.id}" title="Delete Testimonial">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                    <div class="card-image-container">
                        <img src="${displayImg}" alt="${data.intervieweeName}" class="card-image">
                    </div>
                    <div class="card-body">
                        <h3>${data.intervieweeName}</h3>
                        <p class="business">${data.businessName}</p>
                        <p class="quote">"${data.pullQuote}"</p>
                    </div>
                `;

                // Apply staggered animation only when specified
                if (withAnimation) {
                    card.style.animation = `card-load-in 0.4s cubic-bezier(.4,0,.2,1) forwards`;
                    card.style.animationDelay = `${index * 0.05}s`;
                    card.style.opacity = 0; // Start as invisible, animation will make it visible
                }
                gridContainer.appendChild(card);
            });
        }

        // Use event delegation for card clicks
        gridContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.card');
            if (!card) return;

            const editBtn = e.target.closest('.card-hover-btn.edit');
            const deleteBtn = e.target.closest('.card-hover-btn.delete');

            if (editBtn) {
                openEditModal(editBtn.dataset.id);
            } else if (deleteBtn) {
                if (currentUserIsAdmin) {
                    currentActiveId = deleteBtn.dataset.id;
                    deleteModal.classList.add('active');
                } else {
                    showAdminContactModal();
                }
            } else {
                openDetail(card.dataset.id);
            }
        });

        const suggestionsContainer = document.getElementById('search-suggestions');

        // New Reusable Search Handler
        function performSearch(withAnimation = false, showSuggestions = false) {
            const searchTerm = searchBar.value.toLowerCase();
            const clearBtn = document.getElementById('clear-search-btn');

            clearBtn.classList.toggle('visible', searchTerm.length > 0);

            const searchKeywords = searchTerm.split(' ').filter(k => k);

            // Suggestion dropdown rendering
            if (showSuggestions && searchTerm.length > 0 && !searchTerm.endsWith(' ')) {
                const lastWord = searchKeywords[searchKeywords.length - 1];
                const matchingTags = [...allTags].filter(tag => tag.toLowerCase().startsWith(lastWord));

                if (matchingTags.length > 0) {
                    suggestionsContainer.innerHTML = matchingTags.map(tag => `<div class="suggestion-item" data-tag="${tag}">${tag}</div>`).join('');
                    suggestionsContainer.classList.add('visible');
                } else {
                    suggestionsContainer.classList.remove('visible');
                }
            } else {
                suggestionsContainer.classList.remove('visible');
            }

            const includeTranscript = document.getElementById('transcript-search-checkbox').checked;

            // Filter data
            const filteredData = allTestimonials.filter((data) => {
                const tagsString = data.tags ? data.tags.join(' ') : '';
                let searchableText = `${data.intervieweeName} ${data.businessName} ${data.pullQuote} ${tagsString}`.toLowerCase();

                if (includeTranscript && data.transcript) {
                    searchableText += ` ${data.transcript.toLowerCase()}`;
                }

                if (searchKeywords.length === 0) return true;

                const exactPhrase = searchKeywords.join(' ');
                return searchableText.includes(exactPhrase);
            });

            renderGrid(filteredData, withAnimation);
        }

        // Typing listener that updates URL smoothly in real-time
        searchBar.addEventListener('input', (e) => {
            const url = new URL(window.location);
            const searchTerm = e.target.value.trim();
            if (searchTerm) {
                url.searchParams.set('q', searchTerm);
            } else {
                url.searchParams.delete('q');
            }
            // Update the URL without adding millions of keystrokes to history stack
            history.replaceState(null, '', url.pathname + url.search);

            performSearch(false, true); // No load-in animation on keypress, show suggestions
        });

// Also trigger search when checkbox is toggled
const transcriptCheckbox = document.getElementById('transcript-search-checkbox');
transcriptCheckbox.addEventListener('change', () => performSearch(false, false));

// Handle clicking on a suggestion
suggestionsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('suggestion-item')) {
        const selectedTag = e.target.dataset.tag;
        const currentSearch = searchBar.value.split(' ');
        currentSearch.pop();
        currentSearch.push(selectedTag);
        searchBar.value = currentSearch.join(' ') + ' ';
        searchBar.focus();
        suggestionsContainer.classList.remove('visible');

        // Sync the updated search string back to the URL
        const url = new URL(window.location);
        url.searchParams.set('q', searchBar.value.trim());
        history.replaceState(null, '', url.pathname + url.search);

        performSearch(false, false);
    }
});

        // Drag and Drop Logic
        function initializeDragAndDrop() {
            // Ensure we don't initialize it multiple times
            if (gridContainer.sortable) {
                gridContainer.sortable.destroy();
            }

            // Initialize SortableJS for drag-and-drop reordering
            gridContainer.sortable = Sortable.create(gridContainer, {
                animation: 200,
                ghostClass: 'sortable-ghost',
                // Disable functionality based on screen width and admin status
                disabled: window.innerWidth <= 680 || !currentUserIsAdmin,
                onEnd: async function (evt) {
                    const newOrderIds = Array.from(gridContainer.children).map(child => child.dataset.id);
                    const testimonialMap = new Map(allTestimonials.map(item => [item.id, item]));
                    allTestimonials = newOrderIds.map(id => testimonialMap.get(id));

                    const { writeBatch } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
                    const batch = writeBatch(db);
                    newOrderIds.forEach((id, index) => {
                        const docRef = doc(db, "testimonials", id);
                        batch.update(docRef, { order: index });
                    });

                    await batch.commit();
                },
            });

            // Use a media query listener to dynamically enable/disable sorting
            const mediaQuery = window.matchMedia('(max-width: 680px)');
            function handleResize(e) {
                if (gridContainer.sortable) {
                    // Disable if mobile OR if user is not an admin
                    gridContainer.sortable.option('disabled', e.matches || !currentUserIsAdmin);
                }
            }
            mediaQuery.addEventListener('change', handleResize); // Listen for changes
            handleResize(mediaQuery); // Initial check
        }

       // Clear Search Button Logic
        document.getElementById('clear-search-btn').addEventListener('click', () => {
            searchBar.value = '';

            // Clear search from URL
            const url = new URL(window.location);
            url.searchParams.delete('q');
            history.replaceState(null, '', url.pathname + url.search);

            performSearch(false, false);
        });

        // Detail Screen Logic
        const detailContent = document.getElementById('detail-content');
        const backBtn = document.getElementById('back-btn');

       backBtn.addEventListener('click', () => {
            const url = new URL(window.location);
            url.searchParams.delete('testimonial'); // Keep the 'q' parameter intact!
            history.pushState(null, "Testimonial Repository", url.pathname + url.search);
            updateView();
        });

        function renderVideoEmbed(url) {
            if (!url) return 'No video link provided';

            // Check for direct video file links (.mp4, .webm, .ogg, .mov)
            const isDirectVideo = /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
            if (isDirectVideo) {
                return `<video src="${url}" controls class="embedded-video-player" style="width:100%; height:100%; border-radius: var(--radius-lg); object-fit: cover;"></video>`;
            }

            // Check for YouTube links (share url, embed url, or regular link)
            const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
            if (ytMatch && ytMatch[1]) {
                return `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen style="width:100%; height:100%; border-radius: var(--radius-lg);"></iframe>`;
            }

            // Check for Vimeo links
            const vimeoMatch = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/i);
            if (vimeoMatch && vimeoMatch[1]) {
                return `<iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" frameborder="0" allowfullscreen style="width:100%; height:100%; border-radius: var(--radius-lg);"></iframe>`;
            }

            // Check for Google Drive links
            const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)(?:\/view)?/i);
            if (driveMatch && driveMatch[1]) {
                const videoId = driveMatch[1];
                return `<iframe src="https://drive.google.com/file/d/${videoId}/preview" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: var(--radius-lg);"></iframe>`;
            }

            // Default fallback for Frame.io or other presentation URLs:
            // Load in iframe, but provide overlay button to "Open in Frame.io" in case embed fails due to security headers
            return `
                <div class="iframe-container">
                    <iframe src="${url}" frameborder="0" allow="autoplay; fullscreen" style="width:100%; height:100%; border-radius: var(--radius-lg);"></iframe>
                    <div class="iframe-overlay-bar">
                        <a href="${url}" target="_blank" class="btn-ghost-small">↗ Open in Frame.io</a>
                    </div>
                </div>
            `;
        }

        function highlightText(text, query) {
            if (!query || !text) return text;

            // Clean up extra spaces to match the exact phrase search logic
            const cleanQuery = query.trim().replace(/\s+/g, ' ');
            if (!cleanQuery) return text;

            // Escape special characters for regex for the entire consecutive phrase
            const escapedQuery = cleanQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

            // Look for the exact phrase sequentially
            const regex = new RegExp(`(${escapedQuery})`, 'gi');

            return text.replace(regex, '<mark>$1</mark>');
        }

       async function openDetail(id) {
            const searchTerm = searchBar.value.trim();
            const url = new URL(window.location);
            url.searchParams.set('testimonial', id);
            if (searchTerm) {
                url.searchParams.set('q', searchTerm);
            } else {
                url.searchParams.delete('q');
            }
            history.pushState({ testimonialId: id, q: searchTerm }, `Testimonial: ${id}`, url.search);
            updateView();
        }

        async function updateView() {
            const params = new URLSearchParams(window.location.search);
            const testimonialId = params.get('testimonial');
            const searchQuery = params.get('q'); // Get search query

            if (testimonialId) {
                currentActiveId = testimonialId;
                repoScreen.classList.add('hidden');
                detailScreen.classList.remove('hidden');
                setHeaderSmall();
                detailContent.innerHTML = "<p>Loading...</p>";

                // If a search query was passed from the homepage, populate the detail search bar
                if (searchQuery) {
                    detailSearchBar.value = searchQuery;
                    detailClearSearchBtn.classList.add('visible');
                    noResultsMsg.classList.add('hidden'); // Hide any lingering 'no results' message
                } else {
                    detailSearchBar.value = '';
                    detailClearSearchBtn.classList.remove('visible');
                }

                try {
                    const docRef = doc(db, 'testimonials', testimonialId);
                    currentTestimonialData = null; // Reset before fetching
                    const docSnap = await getDoc(docRef);

                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const tagsList = data.tags && data.tags.length > 0
                            ? data.tags.map(tag => `<li><button class="clickable-tag" data-tag="${tag}">${tag}</button></li>`).join('')
                            : '<li style="color:var(--clr-text-muted);font-size:.85rem;">No tags</li>';
                        currentTestimonialData = data; // Store data for in-page search

                        // --- Highlight search terms ---
                        const pullQuoteHtml = `"${data.pullQuote}"`;
                        const notesHtml = data.additionalNotes ? data.additionalNotes : '';
                        const transcriptHtml = data.transcript ? data.transcript : '';

                        // --- Build Links & Downloads ---
                        const links = [];
                        if (data.frameUrl) {
                            links.push(`<a href="${data.frameUrl}" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>Google Video</a>`);
                        }
                        if (data.driveUrl) {
                            links.push(`<a href="${data.driveUrl}" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>Drive Folder</a>`);
                        }

                        const downloads = [];
                        if (data.websiteVideoEditUrl) {
                            downloads.push(`<a href="#" id="download-video-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>Website Video</a>`);
                        }
                        if (data.imageUrl) {
                            downloads.push(`<a href="#" id="download-headshot-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>Headshot</a>`);
                        }
                        if (data.transcript) {
                            downloads.push(`<a href="#" id="download-transcript-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>Transcript</a>`);
                        }

                        let quickLinksContent = '';
                        if (links.length > 0) {
                            quickLinksContent += `<h4>Quick Links</h4>${links.join('')}`;
                        }
                        if (downloads.length > 0) {
                            quickLinksContent += `<h4 style="margin-top: ${links.length > 0 ? '1rem' : '0'};">Downloads</h4>${downloads.join('')}`;
                        }
                        if (links.length === 0 && downloads.length === 0) {
                            quickLinksContent = '<h4>Assets</h4><span style="color:var(--clr-text-muted);font-size:.9rem;">No links or downloads provided</span>';
                        }

                        const displayImg = data.imageUrl || 'https://placehold.co/120x120/eef0ff/7b89ff?text=' + data.intervieweeName.charAt(0);

                        detailContent.innerHTML = `
                            <div class="detail-header">
                                ${data.imageUrl ? `<img src="${displayImg}" alt="${data.intervieweeName}" class="detail-avatar">` : ''}
                                <div class="detail-header-text">
                                    <h1 class="detail-header-name">${data.intervieweeName}</h1>
                                    <p class="detail-header-biz">${data.businessName}</p>
                                </div>
                            </div>

                            <div class="detail-layout">
                                <div class="detail-left-column">
                                    <div class="quick-links-box desktop-only">
                                        ${quickLinksContent}
                                    </div>
                                    <div class="quick-links-box tags-box">
                                        <h4>Tags</h4>
                                        <ul>${tagsList}</ul>
                                    </div>
                                </div>

                                <div class="detail-main">
                                    <div class="${data.frameUrl ? 'video-placeholder' : 'video-placeholder empty'}">
                                        ${data.frameUrl ? renderVideoEmbed(data.frameUrl) : 'No video link provided'}
                                    </div>

                                    <blockquote class="pull-quote">${pullQuoteHtml}</blockquote>

                                     <div class="quick-links-box mobile-only">
                                        ${quickLinksContent}
                                    </div>


                                    ${data.aiSummary ? `
                                    <div class="ai-summary-box">
                                        <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L14.5 9L22 11.5L14.5 14L12 21L9.5 14L2 11.5L9.5 9L12 2Z"></path></svg>AI Summary Card</h4>
                                        <p class="ai-summary-text">${data.aiSummary}</p>
                                    </div>
                                    ` : ''}



                                    ${data.websiteVideoEditUrl ? `
                                    <div class="website-video-edit-box">
                                        <h4>Website Video-Edit</h4>
                                        <div class="video-edit-player">
                                            <video src="${data.websiteVideoEditUrl}" controls style="width:100%; height:auto; border-radius:var(--radius-md);"></video>
                                        </div>
                                    </div>
                                    ` : ''}

                                    ${data.additionalNotes ? `
                                    <div class="notes-box">
                                        <h4>Additional Notes</h4>
                                        <div class="notes-body">${notesHtml}</div>
                                    </div>
                                    ` : ''}

                                    ${data.transcript ? `
                                    <div class="transcript-box">
                                        <h3>Full Transcript</h3>
                                        <div class="transcript-body">${transcriptHtml}</div>
                                    </div>
                                    ` : ''}
                                </div>
                            </div>
                        `;

                        // --- ANIMATE AI SUMMARY (WORD-BY-WORD REVEAL) ---
                        const summaryElement = detailContent.querySelector('.ai-summary-text');
                        if (summaryElement && 'IntersectionObserver' in window) {
                            const originalText = summaryElement.innerText;
                            // Split by space, but keep the space by capturing it. This preserves line breaks.
                            const words = originalText.split(/(\s+)/);

                            summaryElement.innerHTML = words.map(word => {
                                // Don't wrap whitespace-only strings in spans
                                if (word.trim() === '') {
                                    return word;
                                }
                                return `<span>${word}</span>`;
                            }).join('');

                            const wordSpans = summaryElement.querySelectorAll('span');

                            const observer = new IntersectionObserver((entries, observer) => {
                                entries.forEach(entry => {
                                    if (entry.isIntersecting) {
                                        wordSpans.forEach((span, index) => {
                                            setTimeout(() => {
                                                span.classList.add('visible');
                                            }, index * 30); // Staggered delay for each word
                                        });
                                        observer.unobserve(entry.target); // Animate only once
                                    }
                                });
                            }, {
                                threshold: 0.5 // Trigger when 50% of the element is visible
                            });

                            observer.observe(summaryElement);
                        }

                        // --- Perform initial search if query param exists, or clear if not ---
                        setTimeout(() => {
                            performDetailSearch(searchQuery || '');
                        }, 150); // A little extra delay to ensure DOM is ready

                        const tagElements = detailContent.querySelectorAll('.clickable-tag');
                        tagElements.forEach(tagEl => {
                            tagEl.addEventListener('click', (e) => {
                                // CHANGE e.target to e.currentTarget here:
                                const selectedTag = e.currentTarget.getAttribute('data-tag');
                                history.pushState(null, "Testimonial Repository", window.location.pathname);
                                updateView();
                                searchBar.value = selectedTag;
                                searchBar.dispatchEvent(new Event('input'));
                            });
                        });

                        // Add event listener for the new headshot download button
                        const downloadHeadshotBtn = detailContent.querySelector('#download-headshot-btn');
                        if (downloadHeadshotBtn) {
                            downloadHeadshotBtn.addEventListener('click', async (e) => {
                                e.preventDefault();
                                try {
                                    // Fetch the image as a blob
                                    const response = await fetch(data.imageUrl);
                                    const blob = await response.blob();

                                    // Create a temporary URL for the Blob
                                    const url = URL.createObjectURL(blob);

                                    // Create a temporary link to trigger the download
                                    const tempLink = document.createElement('a');
                                    tempLink.href = url;
                                    const safeFilename = data.intervieweeName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                                    const extension = data.imageUrl.split('.').pop().split('?')[0] || 'jpg';
                                    tempLink.download = `headshot_${safeFilename}.${extension}`;
                                    document.body.appendChild(tempLink);
                                    tempLink.click();

                                    document.body.removeChild(tempLink);
                                    URL.revokeObjectURL(url);
                                } catch (error) { console.error('Error downloading image:', error); }
                            });
                        }
                        // Add event listener for the new video download button
                        const downloadVideoBtn = detailContent.querySelector('#download-video-btn');
                        if (downloadVideoBtn) {
                            downloadVideoBtn.addEventListener('click', async (e) => {
                                e.preventDefault();
                                try {
                                    const response = await fetch(data.websiteVideoEditUrl);
                                    const blob = await response.blob();
                                    const url = URL.createObjectURL(blob);
                                    const tempLink = document.createElement('a');
                                    tempLink.href = url;
                                    const safeFilename = data.intervieweeName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                                    const extension = data.websiteVideoEditUrl.split('.').pop().split('?')[0] || 'mp4';
                                    tempLink.download = `website_video_${safeFilename}.${extension}`;
                                    document.body.appendChild(tempLink);
                                    tempLink.click();
                                    document.body.removeChild(tempLink);
                                    URL.revokeObjectURL(url);
                                } catch (error) {
                                    console.error('Error downloading video:', error);
                                }
                            });
                        }
                        // Add event listener for the new download button
                        const downloadBtn = detailContent.querySelector('#download-transcript-btn');
                        if (downloadBtn) {
                            downloadBtn.addEventListener('click', (e) => {
                                e.preventDefault(); // Prevent the link from navigating

                                // 1. Create a Blob from the transcript text
                                const blob = new Blob([data.transcript], { type: 'text/plain' });

                                // 2. Create a temporary URL for the Blob
                                const url = URL.createObjectURL(blob);

                                // 3. Create a temporary link element to trigger the download
                                const tempLink = document.createElement('a');
                                tempLink.href = url;
                                const safeFilename = data.intervieweeName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                                tempLink.download = `transcript_${safeFilename}.txt`; // e.g., transcript_jane_doe.txt
                                document.body.appendChild(tempLink);
                                tempLink.click();

                                // 4. Clean up by removing the temporary link and revoking the URL
                                document.body.removeChild(tempLink);
                                URL.revokeObjectURL(url);
                            });
                        }
                    } else {
                        detailContent.innerHTML = "<p>Testimonial not found.</p>";
                    }
                } catch (error) {
                    console.error("Error loading detail:", error);
                    detailContent.innerHTML = "<p style='color:red;'>Failed to load details.</p>";
                }
           } else {
                detailScreen.classList.add('hidden');
                repoScreen.classList.remove('hidden');
                setHeaderLarge();
                currentTestimonialData = null;
                document.getElementById('detail-search-bar').value = '';
                document.getElementById('detail-clear-search-btn').classList.remove('visible');

                detailContent.innerHTML = ""; // Stop video playback

                // Sync the search bar DOM element with the search param 'q'
                if (searchQuery) {
                    searchBar.value = searchQuery;
                } else {
                    searchBar.value = '';
                }
                transcriptCheckbox.checked = true; // Set "include transcript" ON as default

                suggestionsContainer.classList.remove('visible');

                // Re-render the grid matching the current query with a load-in animation!
                performSearch(true, false);
            }
        }

        function showAdminContactModal() {
            // Populate the list of admin emails
            adminEmailList.innerHTML = `
                <p style="font-size: .75rem; font-weight: 700; color: var(--clr-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: .5rem;">Administrators</p>
                <div style="background: var(--clr-surface-2); border: 1px solid var(--clr-border); border-radius: var(--radius-md); padding: .75rem 1rem; text-align: left;">
                    ${ADMIN_EMAILS.map(email => `<a href="mailto:${email}" style="color: var(--clr-primary); font-weight: 500; display: block;">${email}</a>`).join('')}
                </div>
            `;
            adminContactModal.classList.add('active');
        }

        closeAdminContactModalBtn.addEventListener('click', () => {
            adminContactModal.classList.remove('active');
        });



        window.addEventListener('popstate', updateView);


        // Edit Screen Modal Logic
        const editForm = document.getElementById('edit-testimonial-form');
        const editStatus = document.getElementById('edit-status');

        async function openEditModal(id) {
            document.getElementById('ai-staging-area').style.display = "none";
            currentActiveId = id;
            editModal.classList.add('active');
            editStatus.innerText = "Loading data...";
            editStatus.style.color = "var(--clr-text-main)";

            try {
                const docRef = doc(db, 'testimonials', currentActiveId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    document.getElementById('edit-interviewee-name').value = data.intervieweeName || '';
                    document.getElementById('edit-business-name').value = data.businessName || '';
                    document.getElementById('edit-pull-quote').value = data.pullQuote || '';
                    document.getElementById('edit-ai-summary').value = data.aiSummary || '';
                    document.getElementById('edit-image-url').value = data.imageUrl || '';
                    document.getElementById('edit-frame-url').value = data.frameUrl || '';
                    document.getElementById('edit-drive-url').value = data.driveUrl || '';
                    document.getElementById('edit-website-video-edit-url').value = data.websiteVideoEditUrl || ''; // Populate new field
                    document.getElementById('edit-additional-notes').value = data.additionalNotes || '';
                    document.getElementById('edit-transcript').value = data.transcript || '';
                    document.getElementById('edit-tags').value = data.tags ? data.tags.join(', ') : '';
                    editStatus.innerText = "";
                }
            } catch (error) {
                console.error("Error fetching for edit:", error);
                editStatus.innerText = "Error loading data.";
                editStatus.style.color = "var(--clr-danger)";
            }
        }

        closeEditModalBtn.addEventListener('click', () => {
            editModal.classList.remove('active');
            editForm.reset();
        });

        // Close edit modal if clicking outside the content area
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) {
                editModal.classList.remove('active');
            }
        });








       editForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!currentActiveId) return;

          // Instant database update status feedback loop
          editStatus.innerText = "Updating database...";
          editStatus.style.color = "var(--clr-success)";

          try {
              const rawTags = document.getElementById('edit-tags').value;
              const tagsArray = rawTags.split(',').map(tag => tag.trim()).filter(tag => tag !== "");

              const docRef = doc(db, 'testimonials', currentActiveId);
              await updateDoc(docRef, {
                  intervieweeName: document.getElementById('edit-interviewee-name').value,
                  businessName: document.getElementById('edit-business-name').value,
                  pullQuote: document.getElementById('edit-pull-quote').value,
                  imageUrl: document.getElementById('edit-image-url').value,
                  frameUrl: document.getElementById('edit-frame-url').value,
                  driveUrl: document.getElementById('edit-drive-url').value,
                  websiteVideoEditUrl: document.getElementById('edit-website-video-edit-url').value,
                  additionalNotes: document.getElementById('edit-additional-notes').value,
                  transcript: document.getElementById('edit-transcript').value,

                  // This safely accepts an empty string, meaning it wipes it cleanly if deleted!
                  aiSummary: document.getElementById('edit-ai-summary').value.trim(),
                  tags: tagsArray,
              });

              editStatus.innerText = "Success! Testimonial updated.";

              await loadTestimonials();
              await updateView();

              setTimeout(() => {
                  editModal.classList.remove('active');
                  editForm.reset();
              }, 1000);

          } catch (error) {
              console.error("Error updating document:", error);
              editStatus.innerText = "Error: " + error.message;
              editStatus.style.color = "var(--clr-danger)";
          }
      });










        // Detail Edit and Delete Logic
        detailEditBtn.addEventListener('click', () => {
            if (currentActiveId) {
                openEditModal(currentActiveId);
            }
        });

        detailDeleteBtn.addEventListener('click', () => {
            if (currentActiveId) {
                if (currentUserIsAdmin) {
                    deleteModal.classList.add('active');
                } else {
                    showAdminContactModal();
                }
            }
        });
        cancelDeleteBtn.addEventListener('click', () => {
            deleteModal.classList.remove('active');
        });

        // Close delete modal if clicking outside the content area
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) {
                deleteModal.classList.remove('active');
            }
        });

        confirmDeleteBtn.addEventListener('click', async () => {
            if (!currentActiveId) return;

            try {
                const docRef = doc(db, 'testimonials', currentActiveId);
                await deleteDoc(docRef);

                deleteModal.classList.remove('active');

                history.pushState(null, "Testimonial Repository", window.location.pathname);
                updateView();

                // Refresh list
                await loadTestimonials();
            } catch (error) {
                console.error("Error deleting testimonial:", error);
                alert("Failed to delete testimonial: " + error.message);
            }
        });