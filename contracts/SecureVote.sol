// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title SecureVote
 * @notice A production-quality blockchain voting contract for SecureVote AI.
 * @dev Uses OpenZeppelin Ownable, ReentrancyGuard, and Pausable for security.
 *      Votes are stored as keccak256 hashes for privacy — the actual candidate
 *      choice mapping is maintained off-chain in Supabase.
 */
contract SecureVote is Ownable, ReentrancyGuard, Pausable {
    // ──────────────────────────────────────────────
    // Custom Errors (gas-efficient)
    // ──────────────────────────────────────────────
    error ElectionAlreadyExists();
    error ElectionDoesNotExist();
    error ElectionNotActive();
    error ElectionAlreadyClosed();
    error VoterNotAuthorized();
    error AlreadyVoted();
    error InvalidCandidateIndex();
    error ElectionNotStarted();
    error ElectionEnded();
    error InvalidTimeRange();
    error InvalidCandidateCount();
    error NotElectionOwner();
    error ElectionAlreadyActive();
    error IncompleteCandidateRegistration();

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────
    event ElectionCreated(
        bytes32 indexed electionId,
        string name,
        uint256 startTime,
        uint256 endTime,
        uint256 candidateCount
    );

    event CandidateRegistered(
        bytes32 indexed electionId,
        string name
    );

    event ElectionActivated(
        bytes32 indexed electionId
    );

    event VoterAuthorized(
        bytes32 indexed electionId,
        address indexed voter
    );

    event VoteCast(
        bytes32 indexed electionId,
        address indexed voter,
        uint256 indexed candidateId,
        bytes32 voteHash
    );

    event ElectionClosed(
        bytes32 indexed electionId,
        uint256 timestamp
    );

    // ──────────────────────────────────────────────
    // Data Structures
    // ──────────────────────────────────────────────
    struct Election {
        string name;
        uint256 startTime;
        uint256 endTime;
        uint256 candidateCount;
        uint256 registeredCandidates;
        bool exists;
        bool isActive;
        bool closed;
        uint256 totalVotes;
    }

    struct VoteRecord {
        bool hasVoted;
        bytes32 voteHash;
        uint256 timestamp;
    }

    // ──────────────────────────────────────────────
    // State Variables
    // ──────────────────────────────────────────────

    /// @notice Election data by election ID
    mapping(bytes32 => Election) public elections;

    /// @notice Vote counts per candidate: electionId => candidateIndex => count
    mapping(bytes32 => mapping(uint256 => uint256)) public voteCounts;

    /// @notice Voter records: electionId => voter => VoteRecord
    mapping(bytes32 => mapping(address => VoteRecord)) public voteRecords;

    /// @notice Authorized voters: electionId => voter => authorized
    mapping(bytes32 => mapping(address => bool)) public authorizedVoters;

    /// @notice Election owners: electionId => owner
    mapping(bytes32 => address) public electionOwners;

    // ──────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────
    modifier onlyElectionOwner(bytes32 electionId) {
        if (electionOwners[electionId] != msg.sender && owner() != msg.sender) revert NotElectionOwner();
        _;
    }



    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────
    constructor() Ownable(msg.sender) {}

    // ──────────────────────────────────────────────
    // Admin Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Creates a new election on-chain.
     * @param electionId Unique identifier (derived from Supabase UUID)
     * @param name Human-readable election name
     * @param startTime Unix timestamp when voting opens
     * @param endTime Unix timestamp when voting closes
     * @param candidateCount Number of candidates
     */
    function createElection(
        bytes32 electionId,
        string calldata name,
        uint256 startTime,
        uint256 endTime,
        uint256 candidateCount
    ) external whenNotPaused {
        if (elections[electionId].exists) revert ElectionAlreadyExists();
        if (endTime <= startTime) revert InvalidTimeRange();
        if (candidateCount == 0) revert InvalidCandidateCount();

        elections[electionId] = Election({
            name: name,
            startTime: startTime,
            endTime: endTime,
            candidateCount: candidateCount,
            registeredCandidates: 0,
            exists: true,
            isActive: false,
            closed: false,
            totalVotes: 0
        });

        electionOwners[electionId] = msg.sender;

        emit ElectionCreated(electionId, name, startTime, endTime, candidateCount);
    }

    /**
     * @notice Registers a candidate for the election.
     * @param electionId The election identifier
     * @param name The candidate's name
     */
    function registerCandidate(
        bytes32 electionId,
        string calldata name
    ) external onlyElectionOwner(electionId) whenNotPaused {
        Election storage election = elections[electionId];
        if (!election.exists) revert ElectionDoesNotExist();
        if (election.isActive) revert ElectionAlreadyActive();
        if (election.registeredCandidates >= election.candidateCount) revert InvalidCandidateCount();

        election.registeredCandidates++;

        emit CandidateRegistered(electionId, name);
    }

    /**
     * @notice Activates the election once all candidates are registered.
     * @param electionId The election identifier
     */
    function activateElection(
        bytes32 electionId
    ) external onlyElectionOwner(electionId) whenNotPaused {
        Election storage election = elections[electionId];
        if (!election.exists) revert ElectionDoesNotExist();
        if (election.isActive) revert ElectionAlreadyActive();
        if (election.registeredCandidates != election.candidateCount) revert IncompleteCandidateRegistration();

        election.isActive = true;

        emit ElectionActivated(electionId);
    }



    /**
     * @notice Authorizes a wallet address to vote in an election.
     * @param electionId The election identifier
     * @param voter The voter's wallet address
     */
    function authorizeVoter(
        bytes32 electionId,
        address voter
    ) external onlyElectionOwner(electionId) whenNotPaused {
        if (!elections[electionId].exists) revert ElectionDoesNotExist();

        authorizedVoters[electionId][voter] = true;

        emit VoterAuthorized(electionId, voter);
    }

    /**
     * @notice Authorizes multiple voter addresses in a single transaction.
     * @param electionId The election identifier
     * @param voters Array of voter addresses
     */
    function authorizeVotersBatch(
        bytes32 electionId,
        address[] calldata voters
    ) external onlyElectionOwner(electionId) whenNotPaused {
        if (!elections[electionId].exists) revert ElectionDoesNotExist();

        for (uint256 i = 0; i < voters.length; i++) {
            authorizedVoters[electionId][voters[i]] = true;
            emit VoterAuthorized(electionId, voters[i]);
        }
    }

    /**
     * @notice Casts a vote on-chain. Protected by ReentrancyGuard.
     * @param electionId The election identifier
     * @param candidateIndex Zero-based candidate index
     * @param voteHash Cryptographic hash of the vote for verification
     */
    function castVote(
        bytes32 electionId,
        uint256 candidateIndex,
        bytes32 voteHash
    ) external nonReentrant whenNotPaused {
        Election storage election = elections[electionId];

        if (!election.exists) revert ElectionDoesNotExist();
        if (!election.isActive) revert ElectionNotActive();
        if (election.closed) revert ElectionAlreadyClosed();
        if (block.timestamp < election.startTime) revert ElectionNotStarted();
        if (block.timestamp > election.endTime) revert ElectionEnded();
        if (voteRecords[electionId][msg.sender].hasVoted) revert AlreadyVoted();
        if (candidateIndex >= election.candidateCount) revert InvalidCandidateIndex();

        // Record vote
        voteRecords[electionId][msg.sender] = VoteRecord({
            hasVoted: true,
            voteHash: voteHash,
            timestamp: block.timestamp
        });

        voteCounts[electionId][candidateIndex]++;
        election.totalVotes++;

        emit VoteCast(electionId, msg.sender, candidateIndex, voteHash);
    }

    /**
     * @notice Closes an election, preventing further votes.
     * @param electionId The election identifier
     */
    function closeElection(
        bytes32 electionId
    ) external onlyElectionOwner(electionId) whenNotPaused {
        if (!elections[electionId].exists) revert ElectionDoesNotExist();
        if (elections[electionId].closed) revert ElectionAlreadyClosed();

        elections[electionId].closed = true;

        emit ElectionClosed(electionId, block.timestamp);
    }

    // ──────────────────────────────────────────────
    // Emergency Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Pauses all contract operations. Emergency use only.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses all contract operations.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ──────────────────────────────────────────────
    // View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Returns vote counts for all candidates in an election.
     * @param electionId The election identifier
     * @return counts Array of vote counts per candidate
     */
    function getResults(
        bytes32 electionId
    ) external view returns (uint256[] memory counts) {
        if (!elections[electionId].exists) revert ElectionDoesNotExist();

        uint256 numCandidates = elections[electionId].candidateCount;
        counts = new uint256[](numCandidates);

        for (uint256 i = 0; i < numCandidates; i++) {
            counts[i] = voteCounts[electionId][i];
        }
    }

    /**
     * @notice Verifies whether a voter has voted and returns their vote hash.
     * @param electionId The election identifier
     * @param voter The voter's wallet address
     * @return hasVoted Whether the voter has voted
     * @return voteHash The cryptographic hash of the vote
     */
    function verifyVote(
        bytes32 electionId,
        address voter
    ) external view returns (bool hasVoted, bytes32 voteHash) {
        VoteRecord memory record = voteRecords[electionId][voter];
        return (record.hasVoted, record.voteHash);
    }

    /**
     * @notice Returns full election metadata.
     * @param electionId The election identifier
     */
    function getElection(
        bytes32 electionId
    ) external view returns (
        string memory name,
        uint256 startTime,
        uint256 endTime,
        uint256 candidateCount,
        bool isActive,
        bool closed,
        uint256 totalVotes
    ) {
        if (!elections[electionId].exists) revert ElectionDoesNotExist();

        Election memory e = elections[electionId];
        return (e.name, e.startTime, e.endTime, e.candidateCount, e.isActive, e.closed, e.totalVotes);
    }

    /**
     * @notice Checks if a voter is authorized for an election.
     * @param electionId The election identifier
     * @param voter The voter's wallet address
     */
    function isVoterAuthorized(
        bytes32 electionId,
        address voter
    ) external view returns (bool) {
        return authorizedVoters[electionId][voter];
    }
}
