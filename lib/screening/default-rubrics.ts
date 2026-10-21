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
