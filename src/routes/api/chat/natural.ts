import * as natural from 'natural';
import { removeStopwords } from 'stopword';
import { Matrix } from 'ml-matrix';

interface Data {
  Question: string;
  Answer: string;
}


const similarityThreshold = 0.2;
let jsonData: Data[] | null = null;

export async function loadData() {
  if (jsonData !== null) {
    return jsonData;
  }

  const gistRawUrl = 'https://gist.githubusercontent.com/CalvinFuss/9918c50ff681c73364c6890c3e5477b4/raw/data.json';

  try {
    const response = await fetch(gistRawUrl);

    if (!response.ok) {
      throw new Error('Failed to fetch data from GitHub');
    }

    const data = await response.text();
    jsonData = JSON.parse(data);
    console.log(jsonData)
    return jsonData;
  } catch (err) {
    console.error(err);
    return []; // Return an empty array in case of an error
  }
}

export const getAnswer = (question: string, jsonData: Data[]) => {
  const tokenizer = new natural.WordTokenizer();
  const cleanUserInput = processInput(question, tokenizer);
  const tfidf = buildTfidf(jsonData, tokenizer);

  const similarityScores: {question: string, answer: string, similarity: number}[] = [];

  jsonData.forEach((data: Data, index: number) => {
    const cleanQuestionTokens = processInput(data.Question, tokenizer);

    const similarity = cosineSimilarity(tfidfVector(tfidf, jsonData.length, cleanUserInput), tfidfVector(tfidf, jsonData.length, cleanQuestionTokens));
    if (similarity > similarityThreshold) {
      similarityScores.push({ question: data.Question, answer: data.Answer, similarity });
    }
  });

  similarityScores.sort((a, b) => b.similarity - a.similarity);

  return similarityScores;
};

export const formatResultsAsString = (results: {question: string, answer: string, similarity: number}[]): string => {
  return results.map((result, index) => `Reference ${index + 1}:\nQuestion: ${result.question}\nAnswer: ${result.answer}\nSimilarity: ${result.similarity.toFixed(2)}\n`).join('\n');
};

const processInput = (input: string, tokenizer: natural.WordTokenizer): string => {
  const inputTokens = tokenizer.tokenize(input);
  return removeStopwords(inputTokens).join(' ');
};

const buildTfidf = (jsonData: Data[], tokenizer: natural.WordTokenizer): natural.TfIdf => {
  const tfidf = new natural.TfIdf();

  jsonData.forEach((data: Data) => {
    const cleanQuestionTokens = processInput(data.Question, tokenizer);
    tfidf.addDocument(cleanQuestionTokens);
  });

  return tfidf;
};

const tfidfVector = (tfidf: natural.TfIdf, numDocs: number, document: string): number[] => {
  const vector = Array(numDocs).fill(0);

  tfidf.tfidfs(document, (i: number, measure: number) => {
    vector[i] = measure;
  });

  return vector;
};

const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    const a = new Matrix([vecA]);
    const b = new Matrix([vecB]);
  
    return a.dot(b.transpose()) / (a.norm('frobenius') * b.norm('frobenius'));
  };

loadData();