package com.sinc.enhanced.ui.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.dao.SearchHistoryDao
import com.sinc.enhanced.data.local.entity.SearchHistoryEntity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SearchHistoryViewModel(
    private val searchHistoryDao: SearchHistoryDao
) : ViewModel() {

    private val _searchHistory = MutableStateFlow<List<SearchHistoryEntity>>(emptyList())
    val searchHistory: StateFlow<List<SearchHistoryEntity>> = _searchHistory.asStateFlow()

    init {
        loadHistory()
    }

    private fun loadHistory() {
        viewModelScope.launch {
            val history = searchHistoryDao.getRecent(limit = 20)
            _searchHistory.value = history
        }
    }

    fun clearHistory() {
        viewModelScope.launch {
            searchHistoryDao.deleteAll()
            _searchHistory.value = emptyList()
        }
    }

    class Factory(private val searchHistoryDao: SearchHistoryDao) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return SearchHistoryViewModel(searchHistoryDao) as T
        }
    }
}