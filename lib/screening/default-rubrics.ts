/**
 * Default MxML Screening Rubrics
 * Used for systematic literature review screening based on Title, Abstract, Year, and Journal
 */

export interface ScreeningRubrics {
  inclusionRules: string;
  exclusionRules: string;
  specialRules: string;
  definitions: string;
  mlTerms: string;
  psychometricianJobs: string;
}

export const DEFAULT_INCLUSION_RULES = `- RI1: The authors explicitly state that it is about the design, development, and/or validation of a measurement instrument, and the study involves machine learning (ML) that is applied to measurement problems.
- RI2: The authors explicitly state that it is a conceptual article related to measurement, and the study involves ML that is applied to measurement problems.
- RI3: The study involves creating automated scoring models of behavioral data.
- RI4: The study involves applying ML methods to one of the procedures listed in the List of a Psychometrician's Job below.
- RI5: The study is about methodological advancements of ML with reference to measurement applications or context.
- RI6a: A post-2000 article *studies ML methods* (without situating the methods in a non-measurement application or context) and is published on any of the journals listed next following the the + signs.
    + Educational Measurement Issues and Practice, Journal of Educational Measurement, Journal of Computerized Adaptive Testing, Journal of Educational and Behavioral Statistics, Psychometrika, Psychological Methods, Behavioral Research Methods, Multivariate Behavioral Research, British Journal of Mathematical and Statistical Psychology, ETS research report;
    + Applied Psychological Measurement, Educational and Psychological Measurement, Applied Measurement in Education, Journal of Applied Measurement, Measurement: Interdisciplinary Research and Perspectives, Journal of Measurement and Evaluation in Education and Psychology, Measurement and Evaluation in Counseling and Development, Journal of Measurement and Evaluation in Education and Psychology.
- RI6b: Same as RI6a except for replacing *studies ML methods* with *introduces software program(s) to carry out a ML method(s)*.
- RI7a: A pre-2000 article published in the RI6a journals that *studies ML methods* but has no explicit reference to measurement applications or context.
- RI7b: Same as RI7a except for replacing *studies ML methods* with *introduces software program(s) to carry out a ML method(s)*.`;

export const DEFAULT_EXCLUSION_RULES = `- RE1: The intended outcome of the study is not assigning scores or labels to individuals (e.g., a pure methodological paper irrelevant to M and not included per RI6 or RI7, editorial piece)
- RE2: The study focuses on scientific discovery and discourse (e.g., cognitive process, predictors of an outcome, efficacy is an intervention, comparisons of an outcome across groups), building prediction models, or building recommendation systems, rather than engineering a measurement instrument or environment.
- RE3: The study is about assessment but not measurement. That is, the study involves gathering information about individuals, but generates neither a theory of latent constructs or quantitative score or labels of pre-specified latent constructs.
- RE4: The study is about measurement (e.g., psychometric properties of a scale), but it does not pertain to ML (e.g., the ML keyword that enters the paper in the search carries a different and ML-irrelevant meaning in the article) or the ML part of the article was not applied to the measurement problem.
- RE5: The labels/scores assigned to individuals are used only for group summaries, and the authors do not explicitly indicate that the scores/labels refer to latent properties (traits/constructs/etc.) of the individuals.
- RE6: The study focuses on developing or studying a learning environment rather than a measurement environment.
- RE7: Special rules of exclusion (see below section) applied to the method involved in the paper.
- RE8: This paper is an erratum of or an addendum to an existing paper regardless of whether the original paper is relevant for MxML (i.e., the double counting rule).`;

export const DEFAULT_SPECIAL_RULES = `- HMM: Exclude if HMM is the only statistical method that qualifies the study for inclusion AND HMM was NOT applied to natural language/text/sequence data to identify latent structures behind unstructured data.
- PCA: Exclude if PCA is the only statistical method that qualifies the study for inclusion AND PCA is NOT presented as a part of a ML scheme.
- OPT: Exclude if optimization methods (e.g., EM algorithm, genetic algorithm, simulated annealing, bio-inspired algorithms) are the only statistical method that qualifies the study for inclusion AND the optimization methods do NOT address typical computational challenges encountered in ML applications, for instance, large N (sample size/item pool size) and large P (large number of model parameters/latent dimensions), rendering traditional optimization/estimation methods computationally burdensome or infeasible.
- CLU: Exclude if cluster analysis is the only statistical method that qualifies the study for inclusion AND cluster analysis is applied as a general data analysis method rather than forming a measure or serving as a tool for a psychometrician's job.
- PEN: Exclude if penalized estimation and regularization is the only statistical method that qualifies the study for inclusion AND penalized estimation and regularization is NOT used for variable selection.`;

export const DEFAULT_DEFINITIONS = `Definition of "measurement" in this project: The term "measurement" in this project refers to "measurement in education and psychology". As opposed to physical measurement, measurement in education and psychology involves assigning numbers to individual persons to reflect their trait level. In this literature review project, we adopt a narrow definition of measurement, one that requires explicit attention to engineering a measurement instrument or environment that collects behavioral data so as to assign quantitative scores or labels of pre-specified latent constructs to individuals.

Definition of "machine learning" in this project: Besides the approaches commonly considered as in the scope of machine learning, also include the approaches listed in the "ML Terms" section below.`;

export const DEFAULT_ML_TERMS = `"machine" OR
"machine learning" OR
"data mining" OR
"mining" OR
"supervised learning" OR
"unsupervised learning" OR
"naive Bayes" OR
"nearest neighbors" OR
"regularization" OR
"elastic net" OR
"lasso" OR
"ridge" OR
"sparsity" OR
"high-dimensional" OR
"high dimensional" OR
"neural networks" OR
"neural network" OR
"neural nets" OR
"deep learning" OR
"transfer learning" OR
"reinforcement learning" OR
"auto encoder" OR
"LSTM" OR
"long short term memory" OR
"RNN" OR
"GRU" OR
"convolution" OR
"perceptron" OR
"feed forward" OR
"Boltzmann machine" OR
"neural Turing machine" OR
"regression tree" OR
"classification tree" OR
"decision tree" OR
"CART" OR
"processing tree" OR
"ensemble" OR
"random forest" OR
"boosting" OR
"XGBoost" OR
"extreme gradient boosting" OR
"support vector machine" OR
"SVM" OR
"cluster analysis" OR
"clustering" OR
"k means" OR
"k-means" OR
"dimension reduction" OR
"dimensionality reduction" OR
"principal components" OR
"state space models" OR
"Hidden markov models" OR
"natural language processing" OR
"NLP" OR
"natural language processing (NLP)" OR
"text mining" OR
"text-mining" OR
"word embeddings" OR
"dependent Dirichlet process" OR
"LDA" OR
"latent dirichlet process" OR
"latent dirichlet allocation" OR
"latent semantic analysis" OR
"process data" OR
"log file analysis" OR
"action sequences" OR
"Bayesian networks" OR
"graphical model" OR
"graphic model" OR
"Ising model" OR
"spectral clustering" OR
"collaborative filtering" OR
"reinforcement learning" OR
"recommender system" OR
"markov decision process" OR
"latent class analysis"`;

export const DEFAULT_PSYCHOMETRICIAN_JOBS = `- designing how a measurement instrument (e.g., a test) is scored
- standard-setting
- designing automated generation of items
- detecting cheating
- analyzing items
- calibrating item parameters
- characterizing examinee behavior
- validating a measurement instrument
- studying measurement models and algorithms
- studying the reliability of a measurement instrument
- other tasks that are similar or related to the above`;

export const DEFAULT_RUBRICS: ScreeningRubrics = {
  inclusionRules: DEFAULT_INCLUSION_RULES,
  exclusionRules: DEFAULT_EXCLUSION_RULES,
  specialRules: DEFAULT_SPECIAL_RULES,
  definitions: DEFAULT_DEFINITIONS,
  mlTerms: DEFAULT_ML_TERMS,
  psychometricianJobs: DEFAULT_PSYCHOMETRICIAN_JOBS,
};

/**
 * Build the complete screening system prompt from rubrics
 */
export function buildScreeningSystemPrompt(rubrics: ScreeningRubrics): string {
  return `You are a systematic review expert tasked with screening a study based on its Title, Abstract, Year of Publication, and Journal, as provided at the end of this prompt. Follow the steps below.

- Step 1: Label the study as "NoAbstract" if the abstract is missing. Otherwise, follow Steps 2-4 below.
- Step 2: Include the study if it meets ANY of the "Inclusion Rules" listed below and record in "Rules Used" ALL of the "Inclusion Rules" that were applied to this study. Exclude the study if it meets none of the "Inclusion Rules" and record the "Rules Used" as "No RI applied".
- Step 3: For a study considered included in Step 2, further check the "Special Rules for Exclusion" and exclude it if any applies. At this step, only check the "Special Rules for Exclusion", and do not check the "Exclusion Rules".
- Step 4: For a study considered excluded in Step 2 or Step 3, identify which "Exclusion Rule(s)" were applied among (1) the "Exclusion Rules" listed below and (2) the "Special Rules for Exclusion" listed below, and replace "Rules Used" for this study with all identified "Exclusion Rule(s)".

Please provide:

Explanation: A step-by-step rationale for your decision.
Rules Used: Prefixes of the inclusion or exclusion rules applied.
Decision: Include, Exclude, NoAbstract

Do NOT generate anything apart from the labels for Decision. Always provide a Decision after the Explanation and Rules Used.

FORMAT:
Explanation: [Step-by-step explanation]
Rules Used: [Prefixes of inclusion or exclusion rules used for the decision, or "No RI applied" when applicable]
Decision: Include/Exclude/NoAbstract

${rubrics.definitions}

Inclusion Rules:

${rubrics.inclusionRules}

Exclusion Rules:

${rubrics.exclusionRules}

Special Rules of Exclusion:

${rubrics.specialRules}

List of a Psychometrician's Job:

${rubrics.psychometricianJobs}

ML Terms:

${rubrics.mlTerms}`;
}

/**
 * Build the user message for a single article
 */
export function buildArticlePrompt(
  title: string,
  abstract: string,
  year: string,
  journal: string
): string {
  return `Title: ${title}

Abstract: ${abstract || '[No abstract provided]'}

Year of Publication: ${year}

Journal: ${journal}`;
}

/**
 * Article input for batch screening
 */
export interface BatchArticleInput {
  index: number;
  id: string;
  title: string;
  abstract: string;
  year: string;
  journal: string;
}

/**
 * Build the system prompt for batch screening (returns JSON)
 */
export function buildBatchScreeningSystemPrompt(rubrics: ScreeningRubrics): string {
  return `You are a systematic review expert. You will screen multiple studies based on their Title, Abstract, Year, and Journal.

For EACH study, follow these steps:
- Step 1: Label as "NoAbstract" if abstract is missing/empty. Otherwise, continue.
- Step 2: Include if it meets ANY Inclusion Rule. Record ALL matching rules.
- Step 3: For included studies, check Special Rules for Exclusion - exclude if any applies.
- Step 4: For excluded studies, identify which Exclusion Rule(s) apply.

${rubrics.definitions}

=== INCLUSION RULES ===
${rubrics.inclusionRules}

=== EXCLUSION RULES ===
${rubrics.exclusionRules}

=== SPECIAL RULES FOR EXCLUSION ===
${rubrics.specialRules}

=== PSYCHOMETRICIAN'S JOB LIST ===
${rubrics.psychometricianJobs}

=== ML TERMS ===
${rubrics.mlTerms}

=== OUTPUT FORMAT ===
You MUST respond with valid JSON only. No markdown, no explanation outside JSON.
Return an array of screening results, one for each article in the exact order provided.

{
  "results": [
    {
      "index": 0,
      "decision": "Include|Exclude|NoAbstract",
      "rules_used": "RI1, RI3 or RE2, RE4 or NoAbstract or No RI applied",
      "explanation": "Brief 1-2 sentence rationale"
    }
  ]
}

CRITICAL RULES:
1. Return EXACTLY one result per article, in the same order as input
2. "decision" must be exactly "Include", "Exclude", or "NoAbstract"
3. "rules_used" should list rule prefixes (RI1, RE2, etc.) or "No RI applied" or "NoAbstract"
4. Keep explanations brief but informative
5. Output ONLY valid JSON, nothing else`;
}

/**
 * Build the user message for batch screening
 */
export function buildBatchArticlesPrompt(articles: BatchArticleInput[]): string {
  const articleTexts = articles.map((article, idx) => {
    const abstractText = article.abstract?.trim()
      ? article.abstract
      : '[NO ABSTRACT]';

    return `=== ARTICLE ${idx} ===
Title: ${article.title || '[No title]'}
Abstract: ${abstractText}
Year: ${article.year || 'Unknown'}
Journal: ${article.journal || 'Unknown'}`;
  });

  return `Screen the following ${articles.length} articles:\n\n${articleTexts.join('\n\n')}`;
}
