document.addEventListener("DOMContentLoaded", async () => {

    // ── DOM References ────────────────────────────────────────────────────────
    const submitBtn             = document.getElementById("submit-btn");
    const viewedInput           = document.getElementById("viewed-anime");
    const genreInput            = document.getElementById("genre-preferences");
    const nsfwCheckbox          = document.getElementById("nsfw-filter");
    const recommendationsSection = document.getElementById("Recommendations");
    const recommendationList    = document.getElementById("recommendation-list");
    const recCountBadge         = document.getElementById("rec-count");

    // ── Tags treated as NSFW ─────────────────────────────────────────────────
    const NSFW_TAGS = new Set(["nsfw", "ecchi", "harem"]);

    // ── Merged database (populated on load) ──────────────────────────────────
    let database = [];

    // ── Load & merge both JSON databases ─────────────────────────────────────
    async function loadDatabases() {
        try {
            const [animeRes, mangaRes] = await Promise.all([
                fetch("anime-database.json"),
                fetch("manga-manhua-manhwa-database.json")
            ]);

            if (!animeRes.ok) throw new Error("anime-database.json failed to load.");
            if (!mangaRes.ok) throw new Error("manga-manhua-manhwa-database.json failed to load.");

            const animeData = await animeRes.json();
            const mangaData = await mangaRes.json();

            // Tag source so the source-filter can act on it
            database = [
                ...animeData.map(item => ({ ...item, source: "anime" })),
                ...mangaData.map(item => ({ ...item, source: "manga" }))
            ];

        } catch (err) {
            showBanner("⚠ Could not load the database. Make sure you are serving this page from a web server.", "error");
            console.error(err);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Split a comma-separated string into a lowercase trimmed array.
     */
    function parseInput(raw) {
        return raw
            .split(",")
            .map(s => s.trim().toLowerCase())
            .filter(Boolean);
    }

    /**
     * Score and filter the merged database.
     *
     * @param {string[]} viewedList  - Titles already seen (lowercase)
     * @param {string[]} genreList   - Desired genres (lowercase)
     * @param {boolean}  excludeNSFW - Whether to strip NSFW/ecchi entries
     * @param {string}   sourceFilter - "all" | "anime" | "manga"
     * @returns Array sorted by genre-match score descending, then alphabetically
     */
    function getRecommendations(viewedList, genreList, excludeNSFW, sourceFilter) {
    const NSFW_TAGS = new Set(["nsfw", "ecchi", "harem"]);

    // Build a genre frequency map from the viewed titles
    const viewedGenreMap = {};
    viewedList.forEach(viewedTitle => {
        const match = database.find(item =>
            item.title.toLowerCase() === viewedTitle
        );
        if (match) {
            match.genres.forEach(g => {
                const key = g.toLowerCase();
                viewedGenreMap[key] = (viewedGenreMap[key] || 0) + 1;
            });
        }
    });

    return database
        .map(item => {
            const itemGenresLower = item.genres.map(g => g.toLowerCase());

            // Score 1: how many stated genres it matches (weighted higher)
            const statedScore = genreList.filter(g =>
                itemGenresLower.includes(g)
            ).length;

            // Score 2: how much it overlaps with genres from viewed titles
            const viewedScore = itemGenresLower.reduce((sum, g) => {
                return sum + (viewedGenreMap[g] || 0);
            }, 0);

            // Combined — stated preferences count double
            const totalScore = (statedScore * 2) + viewedScore;

            return { ...item, statedScore, viewedScore, totalScore };
        })
        .filter(item => {
            // Must match at least one stated genre
            if (item.statedScore === 0) return false;

            // Exclude viewed titles
            if (viewedList.includes(item.title.toLowerCase())) return false;

            // NSFW filter
            if (excludeNSFW) {
                const hasNSFW = item.genres.some(g => NSFW_TAGS.has(g.toLowerCase()));
                if (hasNSFW) return false;
            }

            // Source filter
            if (sourceFilter === "anime" && item.source !== "anime") return false;
            if (sourceFilter === "manga" && item.source !== "manga") return false;

            return true;
        })
        .sort((a, b) => b.totalScore - a.totalScore || a.title.localeCompare(b.title))
        .slice(0, 5);
}       

    // ── Rendering ─────────────────────────────────────────────────────────────

    /**
     * Build the type-badge HTML for a result card.
     * Anime entries carry their own type[] array; manga entries use their type[].
     */
    function buildBadges(item) {
        const colorMap = {
            "Anime":   "badge-anime",
            "Manga":   "badge-manga",
            "Manhwa":  "badge-manhwa",
            "Manhua":  "badge-manhua",
            "Movie":   "badge-movie"
        };
        const types = item.type || (item.source === "anime" ? ["Anime"] : ["Manga"]);
        return types
            .map(t => `<span class="badge ${colorMap[t] || "badge-manga"}">${t}</span>`)
            .join("");
    }

    /**
     * Render score dots (up to 5 filled dots).
     */
    function buildScoreDots(score) {
        const filled = Math.min(score, 5);
        const empty  = 5 - filled;
        return "●".repeat(filled) + "○".repeat(empty);
    }

    function displayRecommendations(results) {
        // Update count badge
        recCountBadge.textContent = results.length > 0 ? `${results.length} found` : "";

        if (results.length === 0) {
            recommendationList.innerHTML = `
                <div class="no-results">
                    <p>No matches found.</p>
                    <p class="no-results-hint">Try broadening your genres, or removing some watched titles.</p>
                </div>`;
            return;
        }

        recommendationList.innerHTML = results
            .map((item, i) => `
                <article class="rec-card" style="animation-delay:${Math.min(i * 35, 700)}ms">
                    <div class="rec-card-top">
                        <span class="rec-title">${escapeHtml(item.title)}</span>
                        <div class="rec-badges">${buildBadges(item)}</div>
                    </div>
                    <div class="rec-genres">
                        ${item.genres.map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join("")}
                    </div>
                    <div class="rec-footer">
                    <span class="score-dots" title="${item.totalScore} total score">${buildScoreDots(Math.min(item.statedScore, 5))}</span>
                     <span class="score-label">${item.statedScore} genre match${item.statedScore !== 1 ? "es" : ""}</span>
                        ${item.viewedScore > 0
                            ? `<span class="score-history">· similar to your history</span>`
                            : ""}
                    </div>
                </article>
            `).join("");
    }

    /**
     * Show an inline banner message (not alert()).
     */
    function showBanner(message, type = "info") {
        recommendationsSection.classList.remove("hidden");
        recommendationList.innerHTML = `
            <div class="no-results ${type === "error" ? "no-results--error" : ""}">
                <p>${escapeHtml(message)}</p>
            </div>`;
        recCountBadge.textContent = "";
    }

    /** Minimal XSS guard for user-supplied text rendered via innerHTML */
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // ── Validation helper ─────────────────────────────────────────────────────
    function flashError(el) {
        el.classList.add("input-error");
        el.focus();
        setTimeout(() => el.classList.remove("input-error"), 900);
    }

    // ── Main action ───────────────────────────────────────────────────────────
    function handleSubmit() {
        const viewed = viewedInput.value.trim();
        const genres = genreInput.value.trim();

        if (!genres) {
            flashError(genreInput);
            return;
        }

        const viewedList   = parseInput(viewed);
        const genreList    = parseInput(genres);
        const excludeNSFW  = nsfwCheckbox.checked;
        const sourceFilter = document.querySelector('input[name="source-filter"]:checked').value;

        const results = getRecommendations(viewedList, genreList, excludeNSFW, sourceFilter);

        recommendationsSection.classList.remove("hidden");
        displayRecommendations(results);

        // Smooth scroll to results
        requestAnimationFrame(() => {
            recommendationsSection.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    // ── Event Listeners ───────────────────────────────────────────────────────
    submitBtn.addEventListener("click", handleSubmit);

    // Ctrl+Enter inside either textarea also submits
    [viewedInput, genreInput].forEach(el => {
        el.addEventListener("keydown", e => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
        });
    });

    // ── Initialise ────────────────────────────────────────────────────────────
    await loadDatabases();
});
