import ActivityPerformanceCatalogRepository from '../repositories/ActivityPerformanceCatalogRepository.js';

export default class ActivityPerformanceCatalogService {
  constructor(repository = new ActivityPerformanceCatalogRepository()) {
    this.ActivityPerformanceCatalogRepository = repository;
  }

  getDomainsAsync = async () => {
    return await this.ActivityPerformanceCatalogRepository.getDomainsAsync();
  };

  getCategoriesAsync = async () => {
    return await this.ActivityPerformanceCatalogRepository.getCategoriesAsync();
  };

  getSkillsAsync = async () => {
    return await this.ActivityPerformanceCatalogRepository.getSkillsAsync();
  };
}
