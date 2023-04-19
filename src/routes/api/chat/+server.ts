import type { CreateChatCompletionRequest, ChatCompletionRequestMessage } from 'openai';
import type { RequestHandler } from './$types';
import { getTokens } from '$lib/tokenizer';
import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import { loadData, getAnswer, formatResultsAsString } from './natural';
import sql from 'mssql';

const sqlConfig: sql.config = {
  user: 'sqladmin',
  password: 'Magier6111',
  server: 'sqlservertestcf.database.windows.net',
  database: 'cfsql',
  options: {
    encrypt: true,
    enableArithAbort: true,
  },
};

async function checkDatabaseExists(databaseName: string) {
  try {
    const request = new sql.Request(pool);
    const result = await request.query(`SELECT name FROM sys.databases WHERE name = N'${databaseName}'`);
    return result.recordset.length > 0;
  } catch (err) {
    console.error(`Error checking database existence: ${err}`);
    return false;
  }
}

let pool: sql.ConnectionPool;

(async () => {
  try {
    pool = await sql.connect(sqlConfig);
    console.log('Connected to SQL Server successfully.');

    const cfsqlExists = await checkDatabaseExists('cfsql');
    if (cfsqlExists) {
      console.log('cfsql database exists.');
    } else {
      console.error('cfsql database does not exist.');
    }
  } catch (err) {
    if (err instanceof sql.ConnectionError) {
      console.error('Error connecting to SQL Server:', err);
    } else if (err instanceof sql.RequestError) {
      console.error('Error executing SQL request:', err);
    } else if (err instanceof sql.PreparedStatementError) {
      console.error('Error with prepared statement:', err);
    } else {
      console.error('Unknown error:', err);
    }
  }
})();

async function printTables() {
  try {
    pool = await sql.connect(sqlConfig);
    const request = new sql.Request(pool);
    const result = await request.query(
      'SELECT s.name AS SchemaName, t.name AS TableName FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id ORDER BY s.name, t.name'
    );
    console.log('List of tables:');
    result.recordset.forEach((row) => {
      console.log(`${row.SchemaName}.${row.TableName}`);
    });
  } catch (err) {
    console.error(`Error fetching list of tables: ${err}`);
  }
}

async function insertMessage(message: string, role: string, name: string, email: string) {
  try {
    // Print the list of tables before inserting the message
    await printTables();
    pool = await sql.connect(sqlConfig);

    const insertQuery = `INSERT INTO dbo.Table1 (Name, Email, Message) VALUES (@Name, @Email, @Message)`;
    const request = new sql.Request(pool);

    request.input('Name', sql.NVarChar, role === 'user' ? 'Calvin' : 'Assistant');
    request.input('Email', sql.NVarChar, email);
    request.input('Message', sql.NVarChar, message);
    await request.query(insertQuery);
  } catch (err) {
    console.error(`Error inserting message: ${err}`);
  }
}

const OPENAI_KEY = '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';

export const config: Config = {
  runtime: 'edge',
};




export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!OPENAI_KEY) {
      throw new Error('OPENAI_KEY env variable not set');
    }

    const requestData = await request.json();
	
    if (!requestData) {
      throw new Error('No request data');
    }

    const reqMessages: ChatCompletionRequestMessage[] = requestData.messages;
    console.log(reqMessages)
    if (!reqMessages) {
      throw new Error('no messages provided');
    }

    let tokenCount = 0;
    let messageNumber = 1

    reqMessages.forEach((msg) => {
      const tokens = getTokens(msg.content);
      tokenCount += tokens;
      
      if(reqMessages.length<=7 && messageNumber <7){
        insertMessage(msg.content, msg.role, requestData.name, requestData.email);
        console.log("Iteration One "+ messageNumber)
      }
      else if (requestData.messageCount>7 && messageNumber> requestData.messageCount-3 && messageNumber< requestData.messageCount){
        insertMessage(msg.content, msg.role, requestData.name, requestData.email);
        console.log("Iteration Two "+ messageNumber)
        console.log("Message Content "+ msg.content)
      }
    
    messageNumber = messageNumber+1
    
    console.log("Message Length "+ requestData.messageCount)
  });

    const moderationRes = await fetch('https://api.openai.com/v1/moderations', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      method: 'POST',
      body: JSON.stringify({
        input: reqMessages[reqMessages.length - 1].content,
      }),
    });

    const moderationData = await moderationRes.json();
    const [results] = moderationData.results;

    if (results.flagged) {
      throw new Error('Query flagged by openai');
    }


    const prompt =
      'You are an assistant that creates intelligent responses to context provided as part of inputted questions. Context is added by an algorithm that searches a document for the most relevant pieces of information. Your task is to write meaningful answers based on the user question and use the added context if relevant. If the context is not relevant say "I unfortunately do not have that information"';
    tokenCount += getTokens(prompt);

    const userQuestion = reqMessages[reqMessages.length - 1].content;

    const jsonData = await loadData();
    if (jsonData === null) {
      throw new Error('Failed to load JSON data');
    }
    console.log(jsonData)
    const similarityData = getAnswer(userQuestion, jsonData);
    const answer = formatResultsAsString(similarityData)
   
    console.log(answer)
    const moreInfo = '*I want you to base your answer off the references below: ';
    const message = `${userQuestion} ${moreInfo} ${answer}`;
    console.log(message);

    tokenCount += getTokens(userQuestion) + getTokens(moreInfo) + getTokens(answer);

    if (tokenCount >= 4000) {
      throw new Error('Query too large');
    }

    const messages: ChatCompletionRequestMessage[] = [
      { role: 'system', content: prompt },
      ...reqMessages,
      { role: 'assistant', content: message }, // Include the answer from getAnswer() function
    ];

    const chatRequestOpts: CreateChatCompletionRequest = {
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0.9,
      stream: true,
    };

    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify(chatRequestOpts),
    });

    if (!chatResponse.ok) {
      const err = await chatResponse.json();
      throw new Error(err);
    }

    //insertMessage(response, 'assistant', requestData.name, requestData.email);
    return new Response(chatResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    });
  } catch (err) {
    console.error(err);
    return json({ error: 'There was an error processing your request' }, { status: 500 });
  }
};


