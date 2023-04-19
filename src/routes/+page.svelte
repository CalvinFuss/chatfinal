<script lang="ts">
	import ChatMessage from '$lib/components/ChatMessage.svelte'
	import type { ChatCompletionRequestMessage } from 'openai'
	
	import { SSE } from 'sse.js'

	let query: string = ''
	let answer: string = ''
	let loading: boolean = false
	let chatMessages: ChatCompletionRequestMessage[] = []
	let scrollToDiv: HTMLDivElement
	let interactionStep = 0;
	let userName = '';
	let userEmail = '';

	function scrollToBottom() {
		setTimeout(function () {
			scrollToDiv.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' })
		}, 100)
	}

	function isValidName(name:string) {
    return name.trim().length > 0;
}

function isValidEmail(email: string) {
    const re = /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/;
    return re.test(email);
}



	const handleSubmit = async () => {
    loading = true;

    switch (interactionStep) {
        case 0:
            if (isValidName(query)) {
                userName = query;
                chatMessages = [{ role: 'assistant', content: 'Hello, please enter your name:' }, ...chatMessages, { role: 'user', content: query }];
                chatMessages = [...chatMessages, { role: 'assistant', content: 'Please enter your email address:' }];
                query = '';
                interactionStep++;
            } else {
                chatMessages = [...chatMessages, { role: 'assistant', content: 'Please enter a valid name.' }];
            }
            loading = false;
            break;
        case 1:
            if (isValidEmail(query)) {
                userEmail = query;
                chatMessages = [...chatMessages, { role: 'user', content: query }];
                chatMessages = [...chatMessages, { role: 'assistant', content: 'Thank you! Now you can ask your questions.' }];
                query = '';
                interactionStep++;
            } else {
                chatMessages = [...chatMessages, { role: 'assistant', content: 'Please enter a valid email address.' }];
            }
            loading = false;
            break;
        default:
				loading = true;
				chatMessages = [...chatMessages, { role: 'user', content: query }];
				console.log("Chat messeges: "+ chatMessages)
				const messageCount = chatMessages.length + 1;
				console.log(messageCount)
				const eventSource = new SSE('/api/chat', {
					headers: {
						'Content-Type': 'application/json'
					},
					payload: JSON.stringify({ 
						messages: [...chatMessages, { role: 'user', content: query }],
						messageCount: messageCount,
						name: userName,
    					email: userEmail
						
					})
					
				});

				query = '';

				eventSource.addEventListener('error', handleError);

				eventSource.addEventListener('message', (e) => {
					scrollToBottom();
					try {
						loading = false;
						if (e.data === '[DONE]') {
							chatMessages = [...chatMessages, { role: 'assistant', content: answer }];
							answer = '';
							console.log(chatMessages[chatMessages.length-1])
							return;
						}

						const completionResponse = JSON.parse(e.data);
						const [{ delta }] = completionResponse.choices;

						if (delta.content) {
							answer = (answer ?? '') + delta.content;
						}
					} catch (err) {
						handleError(err);
					}
				});
				eventSource.stream();
				scrollToBottom();
		}
	};

	function handleError<T>(err: T) {
		loading = false
		query = ''
		answer = ''
		console.error(err)
	}
</script>

<div class="flex flex-col pt-4 w-full px-8 items-center gap-2">
	<div>
		<h1 class="text-2xl font-bold w-full text-center">Chatty</h1>
		<p class="text-sm italic">Powered by gpt-3.5-turbo</p>
	</div>
	<div class="h-[500px] w-full bg-gray-900 rounded-md p-4 overflow-y-auto flex flex-col gap-4">
        <div class="flex flex-col gap-2">
            {#if interactionStep === 0}
                <ChatMessage type="assistant" message="Hello, please enter your name:" />
            {/if}
            {#each chatMessages as message}
                <ChatMessage type={message.role} message={message.content} />
            {/each}
            {#if answer}
                <ChatMessage type="assistant" message={answer} />
            {/if}
            {#if loading}
                <ChatMessage type="assistant" message="Loading.." />
            {/if}
        </div>
        <div class="" bind:this={scrollToDiv} />
    </div>
	<form
		class="flex w-full rounded-md gap-4 bg-gray-900 p-4"
		on:submit|preventDefault={() => handleSubmit()}
	>
		<input type="text" class="input input-bordered w-full" bind:value={query} />
		<button type="submit" class="btn btn-accent"> Send </button>
	</form>
</div>
