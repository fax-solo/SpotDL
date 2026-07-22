package com.sinc.enhanced.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sinc.enhanced.SincApp
import com.sinc.enhanced.data.local.dao.SearchHistoryDao
import com.sinc.enhanced.data.repository.SearchRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class HomeUiState(
    val recentSearches: List<String> = emptyList(),
    val recentResults: List<String> = emptyList(),
    val isLoading: Boolean = true
)

class HomeViewModel(
    private val searchHistoryDao: SearchHistoryDao,
    private val searchRepository: SearchRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        loadHome()
    }

    private fun loadHome() {
        viewModelScope.launch {
            try {
                val recent = searchHistoryDao.getRecentQueries()
                val keywords = recent.flatMap { it.split(Regex("\\s+")) }
                    .filter { it.length > 2 }
                    .distinct()
                    .shuffled()
                    .take(5)
                _uiState.value = HomeUiState(
                    recentSearches = recent.take(10),
                    recentResults = keywords,
                    isLoading = false
                )
            } catch (_: Exception) {
                _uiState.value = HomeUiState(isLoading = false)
            }
        }
    }

    fun refresh() {
        loadHome()
    }

    class Factory : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            val container = SincApp.instance.container
            return HomeViewModel(container.database.searchHistoryDao(), container.searchRepository) as T
        }
    }
}
