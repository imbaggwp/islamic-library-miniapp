const ALLOWED_ORIGINS = [
    "https://ТВОЙ-USERNAME.github.io"
];

export default {
    async fetch(request, env) {

        const origin = request.headers.get("Origin") || "";

        const corsHeaders = {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
            "Content-Type": "application/json; charset=utf-8"
        };


        // CORS
        if (request.method === "OPTIONS") {

            if (!ALLOWED_ORIGINS.includes(origin)) {

                return new Response(
                    JSON.stringify({
                        error: "Origin not allowed"
                    }),
                    {
                        status: 403,
                        headers: corsHeaders
                    }
                );

            }

            return new Response(null, {
                status: 204,
                headers: corsHeaders
            });

        }


        if (!ALLOWED_ORIGINS.includes(origin)) {

            return new Response(
                JSON.stringify({
                    error: "Origin not allowed"
                }),
                {
                    status: 403,
                    headers: corsHeaders
                }
            );

        }


        try {

            // Проверяем пароль админки
            const password =
                request.headers.get("X-Admin-Password");


            if (
                !password ||
                password !== env.ADMIN_PASSWORD
            ) {

                return new Response(
                    JSON.stringify({
                        error: "Unauthorized"
                    }),
                    {
                        status: 401,
                        headers: corsHeaders
                    }
                );

            }


            // GET — получить content.json
            if (request.method === "GET") {

                return await getContent(
                    env,
                    corsHeaders
                );

            }


            // POST — сохранить content.json
            if (request.method === "POST") {

                const body =
                    await request.json();


                return await saveContent(
                    env,
                    body,
                    corsHeaders
                );

            }


            return new Response(
                JSON.stringify({
                    error: "Method not allowed"
                }),
                {
                    status: 405,
                    headers: corsHeaders
                }
            );


        } catch (error) {

            return new Response(
                JSON.stringify({
                    error: error.message
                }),
                {
                    status: 500,
                    headers: corsHeaders
                }
            );

        }

    }
};


/* =========================================================
   GET CONTENT
   ========================================================= */

async function getContent(env, headers) {

    const url =
        `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.GITHUB_FILE}`;


    const response =
        await fetch(url, {

            headers: {

                "Authorization":
                    `Bearer ${env.GITHUB_TOKEN}`,

                "Accept":
                    "application/vnd.github+json",

                "X-GitHub-Api-Version":
                    "2022-11-28",

                "User-Agent":
                    "Football-Hub"

            }

        });


    if (!response.ok) {

        const text =
            await response.text();

        throw new Error(
            `GitHub GET error ${response.status}: ${text}`
        );

    }


    const data =
        await response.json();


    const decoded =
        decodeBase64(data.content);


    let content;

    try {

        content =
            JSON.parse(decoded);

    } catch {

        content = {
            streams: {}
        };

    }


    return new Response(

        JSON.stringify({
            content,
            sha: data.sha
        }),

        {
            status: 200,
            headers
        }

    );

}


/* =========================================================
   SAVE CONTENT
   ========================================================= */

async function saveContent(
    env,
    content,
    headers
) {

    const url =
        `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.GITHUB_FILE}`;


    // Получаем текущий SHA
    const current =
        await fetch(url, {

            headers: {

                "Authorization":
                    `Bearer ${env.GITHUB_TOKEN}`,

                "Accept":
                    "application/vnd.github+json",

                "X-GitHub-Api-Version":
                    "2022-11-28",

                "User-Agent":
                    "Football-Hub"

            }

        });


    let sha = null;


    if (current.ok) {

        const currentData =
            await current.json();

        sha = currentData.sha;

    }


    const json =
        JSON.stringify(
            content,
            null,
            2
        );


    const encoded =
        encodeBase64(json);


    const body = {

        message:
            "Update Football Hub content",

        content:
            encoded,

        branch:
            env.GITHUB_BRANCH || "main"

    };


    if (sha) {

        body.sha = sha;

    }


    const response =
        await fetch(url, {

            method: "PUT",

            headers: {

                "Authorization":
                    `Bearer ${env.GITHUB_TOKEN}`,

                "Accept":
                    "application/vnd.github+json",

                "Content-Type":
                    "application/json",

                "X-GitHub-Api-Version":
                    "2022-11-28",

                "User-Agent":
                    "Football-Hub"

            },

            body:
                JSON.stringify(body)

        });


    if (!response.ok) {

        const text =
            await response.text();

        throw new Error(
            `GitHub PUT error ${response.status}: ${text}`
        );

    }


    const result =
        await response.json();


    return new Response(

        JSON.stringify({
            success: true,
            commit: result.commit?.sha || null
        }),

        {
            status: 200,
            headers
        }

    );

}


/* =========================================================
   BASE64
   ========================================================= */

function encodeBase64(str) {

    const bytes =
        new TextEncoder().encode(str);


    let binary = "";

    const chunkSize = 0x8000;


    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {

        binary += String.fromCharCode(
            ...bytes.subarray(
                i,
                i + chunkSize
            )
        );

    }


    return btoa(binary);

}


function decodeBase64(base64) {

    const binary =
        atob(
            base64.replace(/\n/g, "")
        );


    const bytes =
        Uint8Array.from(
            binary,
            char => char.charCodeAt(0)
        );


    return new TextDecoder().decode(bytes);

}
